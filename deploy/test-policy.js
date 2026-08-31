#!/usr/bin/env node

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const deployDir = __dirname;
const policyPath = path.join(deployDir, 'firefox-policies.json');

require(path.join(deployDir, 'gen-policy.js'));

const policy = JSON.parse(fs.readFileSync(policyPath, 'utf8'));
const managed = policy.policies['3rdparty'].Extensions['uBlock0@raymondhill.net'];
const filters = managed.toOverwrite.filters;

assert(Array.isArray(filters), 'the policy must manage uBlock My filters');

for (const retired of ['||twitch.tv^', '||twitchcdn.net^', '||jtvnw.net^']) {
  assert(!filters.includes(retired), `retired filter is still active: ${retired}`);
  assert(
    filters.includes(`${retired}$badfilter`),
    `missing migration for a stale subscribed filter: ${retired}`,
  );
}

assert(filters.includes('|https://www.twitch.tv/|$document'));
assert(filters.includes('||twitch.tv/directory$document'));
assert(filters.includes('||twitch.tv/search$document'));
assert(filters.includes('|https://kick.com/|$document'));
assert(filters.includes('||kick.com/browse$document'));

assert(
  !Object.hasOwn(managed.toOverwrite, 'filterLists'),
  'the policy must preserve the user\'s selected standard and custom lists',
);

const blocked = policy.policies.WebsiteFilter.Block;
assert(!blocked.includes('*://*.twitch.tv/*'));
assert(blocked.includes('*://www.twitch.tv/'));
assert(blocked.includes('*://*.twitch.tv/directory*'));
assert(blocked.includes('*://*.twitch.tv/search*'));

console.log('Firefox policy regression checks passed');
