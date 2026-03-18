#!/usr/bin/env node
// Validates uBlock Origin filter list syntax
// Usage: node validate-filters.js [filter-file]

const fs = require('fs');
const path = require('path');

const file = process.argv[2] || path.join(__dirname, 'ublock-social-media-filters.txt');
const lines = fs.readFileSync(file, 'utf8').split('\n');

let errors = 0;
let warnings = 0;
let stats = { comments: 0, network: 0, cosmetic: 0, exceptions: 0, blank: 0, metadata: 0 };

const VALID_METADATA = /^! (Title|Description|Version|Last modified|Expires|Homepage|License):/;
const NETWORK_FILTER = /^\|?\|[a-zA-Z0-9].*[\^$]/;
const EXCEPTION_FILTER = /^@@\|\|[a-zA-Z0-9]/;
const COSMETIC_FILTER = /^[a-zA-Z0-9.*].*##/;
const COMMENT = /^!/;
const DIRECTIVE = /^!#/;

for (let i = 0; i < lines.length; i++) {
  const line = lines[i].trim();
  const lineNum = i + 1;

  if (line === '') {
    stats.blank++;
    continue;
  }

  // Directives (!#if, !#include, etc.)
  if (DIRECTIVE.test(line)) {
    stats.comments++;
    continue;
  }

  // Comments and metadata
  if (COMMENT.test(line)) {
    if (VALID_METADATA.test(line)) stats.metadata++;
    stats.comments++;
    continue;
  }

  // Exception filters (@@)
  if (line.startsWith('@@')) {
    if (!EXCEPTION_FILTER.test(line)) {
      console.error(`  ERROR line ${lineNum}: malformed exception filter: ${line}`);
      errors++;
    } else {
      // Check for $document modifier on exception filters
      if (!line.includes('$')) {
        console.warn(`  WARN  line ${lineNum}: exception filter has no type modifier: ${line}`);
        warnings++;
      }
      stats.exceptions++;
    }
    continue;
  }

  // Cosmetic filters (##)
  if (line.includes('##')) {
    const parts = line.split('##');
    if (parts.length < 2 || parts[1].trim() === '') {
      console.error(`  ERROR line ${lineNum}: empty cosmetic selector: ${line}`);
      errors++;
    } else {
      // Check for common CSS selector issues
      const selector = parts[1];
      const openParens = (selector.match(/\(/g) || []).length;
      const closeParens = (selector.match(/\)/g) || []).length;
      if (openParens !== closeParens) {
        console.error(`  ERROR line ${lineNum}: unmatched parentheses (${openParens} open, ${closeParens} close): ${line}`);
        errors++;
      }
      stats.cosmetic++;
    }
    continue;
  }

  // Network filters (||domain^)
  if (line.startsWith('||') || line.startsWith('|')) {
    if (!line.includes('^') && !line.includes('$') && !line.includes('*')) {
      console.warn(`  WARN  line ${lineNum}: network filter missing separator (^ or $): ${line}`);
      warnings++;
    }
    // Check for valid domain-like pattern
    const domain = line.replace(/^\|+/, '').split(/[\^$*]/)[0];
    if (!domain || domain.length < 3) {
      console.error(`  ERROR line ${lineNum}: suspiciously short domain: ${line}`);
      errors++;
    }
    stats.network++;
    continue;
  }

  // If we get here, the line doesn't match any known pattern
  console.warn(`  WARN  line ${lineNum}: unrecognized filter syntax: ${line}`);
  warnings++;
}

// Summary
console.log('\n=== Filter List Validation ===\n');
console.log(`  File: ${path.basename(file)}`);
console.log(`  Total lines: ${lines.length}`);
console.log('');
console.log('  Breakdown:');
console.log(`    Metadata headers:  ${stats.metadata}`);
console.log(`    Comments:          ${stats.comments - stats.metadata}`);
console.log(`    Network blocks:    ${stats.network}`);
console.log(`    Exceptions (@@):   ${stats.exceptions}`);
console.log(`    Cosmetic (##):     ${stats.cosmetic}`);
console.log(`    Blank lines:       ${stats.blank}`);
console.log('');

if (errors === 0 && warnings === 0) {
  console.log('  ✓ All filters passed validation\n');
} else {
  if (errors > 0) console.log(`  ✗ ${errors} error(s) found`);
  if (warnings > 0) console.log(`  ⚠ ${warnings} warning(s) found`);
  console.log('');
}

// Cross-check: verify every $document block has matching exceptions (for selective blocking)
const docBlocks = [];
const docExceptions = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('@@') && trimmed.includes('$document')) {
    const domain = trimmed.replace('@@||', '').split(/[/$]/)[0];
    docExceptions.push(domain);
  } else if (!trimmed.startsWith('@@') && !trimmed.startsWith('!') && trimmed.includes('$document')) {
    const domain = trimmed.replace(/^\|+/, '').split(/[/$^]/)[0];
    docBlocks.push({ domain, line: trimmed });
  }
}

if (docBlocks.length > 0) {
  console.log('  Selective blocking summary:');
  for (const block of docBlocks) {
    const exceptions = docExceptions.filter(e => e === block.domain);
    if (block.line.includes(',important')) {
      console.log(`    ${block.domain}: FORCE BLOCKED ($important override)`);
    } else {
      console.log(`    ${block.domain}: blocked with ${exceptions.length} exception(s)`);
    }
  }
  console.log('');
}

// Test matrix
console.log('  === Manual Test Checklist ===\n');

const fullBlocks = [];
for (const line of lines) {
  const trimmed = line.trim();
  if (trimmed.startsWith('||') && !trimmed.startsWith('@@') && trimmed.endsWith('^') && !trimmed.includes('$')) {
    const domain = trimmed.replace('||', '').replace('^', '');
    fullBlocks.push(domain);
  }
}

if (fullBlocks.length > 0) {
  console.log('  Full domain blocks (expect uBlock strict blocking page):');
  for (const domain of fullBlocks) {
    console.log(`    [ ] https://${domain}/`);
  }
  console.log('');
}

console.log('  YouTube selective (expect content hidden, not blocked):');
console.log('    [ ] youtube.com           → homepage feed hidden, search bar works');
console.log('    [ ] youtube.com/watch?v=* → video plays, no sidebar recommendations');
console.log('    [ ] youtube.com/shorts/*  → strict blocking page');
console.log('    [ ] youtube.com/results?search_query=test → no Shorts/Live in results');
console.log('    [ ] youtube.com sidebar   → no Subscriptions section');
console.log('    [ ] youtube.com live      → live streams hidden from feeds');
console.log('    [ ] youtube.com live      → live stream watch page content hidden');
console.log('');

console.log('  Reddit cosmetic (all pages load, feeds hidden on specific pages):');
console.log('    [ ] reddit.com            → page loads, feed hidden');
console.log('    [ ] reddit.com/r/popular  → page loads, feed hidden');
console.log('    [ ] reddit.com/r/all      → page loads, feed hidden');
console.log('    [ ] reddit.com/r/linux    → page loads, feed VISIBLE');
console.log('    [ ] reddit.com/search?q=* → page loads normally');
console.log('    [ ] reddit.com/settings   → page loads normally');
console.log('    [ ] reddit.com ads        → shreddit-ad-post hidden, sidebar ads hidden');
console.log('');

process.exit(errors > 0 ? 1 : 0);
