#!/usr/bin/env node
// Generate WebsiteFilter.Block and uBO's managed My filters from the sources.
//
// Firefox enforces these itself, below the extension layer, so uBO's power
// button cannot reach them -- and unlike the DNS layer, they survive a VPN.

const fs = require('fs');
const path = require('path');
const { readRules } = require('./read-rules');

const BASE = path.join(__dirname, 'firefox-policies.base.json');
const POLICY = path.join(__dirname, 'firefox-policies.json');

// ||domain^                      -> whole domain
// ||domain/path$document         -> path prefix, any subdomain
// |https://host/|$document       -> that exact URL only
const DOMAIN = /^\|\|([\w.-]+)\^$/;
const ROUTE = /^\|\|([\w.-]+)(\/[^$]*)\$document$/;
const EXACT = /^\|https?:\/\/([\w.-]+)(\/[^|]*)\|\$document$/;

// Older releases fully blocked Twitch in both My filters and the subscribed
// public list. These directives disable those exact stale filters wherever
// uBO finds them, without changing the user's other selected filter lists.
const RETIRED_FILTER_MIGRATIONS = [
  '||twitch.tv^$badfilter',
  '||twitchcdn.net^$badfilter',
  '||jtvnw.net^$badfilter',
];

const patterns = [];
const unhandled = [];
const rules = readRules();

for (const raw of rules) {
  const line = raw.trim();
  if (!line || line.startsWith('!') || line.includes('##')) continue;

  let m;
  if ((m = DOMAIN.exec(line))) {
    patterns.push(`*://*.${m[1]}/*`);
  } else if ((m = ROUTE.exec(line))) {
    patterns.push(`*://*.${m[1]}${m[2]}*`);
  } else if ((m = EXACT.exec(line))) {
    patterns.push(`*://${m[1]}${m[2]}`, `*://${m[1]}${m[2]}?*`);
  } else {
    unhandled.push(line);
  }
}

const block = [...new Set(patterns)].sort();
if (block.length > 1000) throw new Error(`${block.length} patterns exceeds Firefox's 1000 limit`);

const policy = JSON.parse(fs.readFileSync(BASE, 'utf8'));
policy.policies.WebsiteFilter = { Block: block, Exceptions: [] };

const managed = policy.policies['3rdparty'].Extensions['uBlock0@raymondhill.net'];
managed.toOverwrite.filters = [
  ...new Set(rules.map((raw) => raw.trim()).filter(Boolean)),
  ...RETIRED_FILTER_MIGRATIONS,
];

fs.writeFileSync(POLICY, JSON.stringify(policy, null, 2) + '\n');

console.log(`${block.length} block patterns -> ${POLICY}`);
for (const line of unhandled) console.warn(`  not translated: ${line}`);
