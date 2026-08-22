#!/usr/bin/env node
// Generate WebsiteFilter.Block in firefox-policies.json from the filter list.
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

const patterns = [];
const unhandled = [];

for (const raw of readRules()) {
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
fs.writeFileSync(POLICY, JSON.stringify(policy, null, 2) + '\n');

console.log(`${block.length} block patterns -> ${POLICY}`);
for (const line of unhandled) console.warn(`  not translated: ${line}`);
