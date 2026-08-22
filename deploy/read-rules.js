// Shared source reader for the generators.
//
// The published filter list plus, if present, deploy/local-blocks.txt -- rules
// personal to this machine that should not be published. Both use uBO syntax
// and feed the same generated layers.

const fs = require('fs');
const path = require('path');

const PUBLISHED = path.join(__dirname, '..', 'ublock-social-media-filters.txt');
const LOCAL = path.join(__dirname, 'local-blocks.txt');

function readRules() {
  const lines = fs.readFileSync(PUBLISHED, 'utf8').split('\n');
  if (fs.existsSync(LOCAL)) {
    lines.push(...fs.readFileSync(LOCAL, 'utf8').split('\n'));
  }
  return lines;
}

module.exports = { readRules, PUBLISHED, LOCAL };
