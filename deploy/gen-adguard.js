#!/usr/bin/env node
// Generate AdGuard Home user_rules from the filter list.
//
// DNS resolves names, not paths, so only whole-domain blocks carry over.
// Route blocks are the WebsiteFilter layer's job.

const fs = require('fs');
const path = require('path');
const { readRules } = require('./read-rules');

const OUT = path.join(__dirname, 'adguardhome-user-rules.txt');

const DOMAIN = /^\|\|[\w.-]+\^$/;

const rules = [];
for (const raw of readRules()) {
  const line = raw.trim();
  if (DOMAIN.test(line)) rules.push(line);
}

fs.writeFileSync(OUT, rules.join('\n') + '\n');
console.log(`${rules.length} domain rules -> ${OUT}`);
