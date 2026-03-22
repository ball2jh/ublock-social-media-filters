#!/usr/bin/env node
// Audit uBlock filter list selectors against live site DOM
// Extracts cookies from Firefox profile, loads real pages with Playwright,
// and validates every cosmetic selector against the actual DOM.
//
// Usage: node audit-filters.js

const { firefox } = require('playwright');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ============================================================
// Configuration
// ============================================================

const FILTER_FILE = path.join(__dirname, 'ublock-social-media-filters.txt');
const FIREFOX_PROFILE = path.join(
  os.homedir(),
  '.config/mozilla/firefox/zwn1ks2d.default-release'
);
const COOKIES_DB = path.join(FIREFOX_PROFILE, 'cookies.sqlite');
const PAGE_LOAD_TIMEOUT = 20000;
const SPA_RENDER_WAIT = 4000;

// Pages to audit — each with the selectors expected to match there
const YOUTUBE_PAGES = [
  {
    name: 'Homepage',
    url: 'https://www.youtube.com/',
    selectors: [
      'ytd-browse[page-subtype="home"]',
      'ytd-guide-entry-renderer',
      'ytd-mini-guide-entry-renderer',
      'a[href="/feed/subscriptions"]',
      'yt-chip-cloud-chip-renderer',
    ],
  },
  {
    name: 'Search (shorts)',
    url: 'https://www.youtube.com/results?search_query=shorts',
    selectors: [
      '[overlay-style="SHORTS"]',
      'yt-chip-cloud-chip-renderer',
      'ytd-video-renderer',
      'ytd-reel-shelf-renderer',
    ],
  },
  {
    name: 'Search (live)',
    url: 'https://www.youtube.com/results?search_query=live+stream+now',
    selectors: [
      'ytd-thumbnail[is-live-video]',
      'badge-shape.yt-badge-shape--live',
      'yt-chip-cloud-chip-renderer',
      'ytd-video-renderer',
    ],
  },
  {
    name: 'Watch page',
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    selectors: [
      'ytd-watch-next-secondary-results-renderer',
      '.ytp-ce-element',
      '.ytp-endscreen-content',
      'ytd-watch-flexy',
    ],
  },
  {
    name: 'Subscriptions feed',
    url: 'https://www.youtube.com/feed/subscriptions',
    selectors: [
      '[overlay-style="SHORTS"]',
      'ytd-item-section-renderer',
      'ytd-video-renderer',
    ],
  },
  {
    name: 'Channel page (@MrBeast)',
    url: 'https://www.youtube.com/@MrBeast',
    selectors: [
      'yt-tab-shape',
      'tp-yt-paper-tab',
    ],
  },
];

// Known distracting elements that SHOULD be filtered but might not be
const KNOWN_DISTRACTIONS = [
  { selector: 'ytd-promoted-sparkles-web-renderer', desc: 'Promoted/ad content in feed' },
  { selector: '#related', desc: 'Related videos section' },
  { selector: 'ytd-merch-shelf-renderer', desc: 'Merch shelf on watch page' },
  { selector: '.ytp-suggested-action', desc: 'Suggested action overlay on player' },
  { selector: 'ytd-engagement-panel-section-list-renderer[target-id="engagement-panel-structured-description"]', desc: 'Structured description panel' },
  { selector: '#clarify-box', desc: 'Context/info box on watch page' },
  { selector: 'ytd-rich-section-renderer:has(#title-text:has-text(/Trending/i))', desc: 'Trending section' },
  { selector: 'ytd-notification-topbar-button-renderer', desc: 'Notification bell' },
  { selector: '.ytp-pause-overlay', desc: 'Pause overlay suggestions' },
  { selector: 'ytd-companion-slot-renderer', desc: 'Companion ad slot' },
];

// Reddit pages to audit — each with selectors expected to match there
const REDDIT_PAGES = [
  {
    name: 'Homepage',
    url: 'https://www.reddit.com/',
    selectors: [
      'shreddit-app[pagetype="home"]',
      'shreddit-feed',
      'shreddit-post',
      'reddit-header-large',
      'recent-posts',
      'reddit-recent-pages',
      'faceplate-tracker[noun="games_drawer"]',
    ],
  },
  {
    name: '/r/popular',
    url: 'https://www.reddit.com/r/popular/',
    selectors: [
      'shreddit-app[pagetype="popular"]',
      'shreddit-feed',
      'shreddit-post',
    ],
  },
  {
    name: '/r/all',
    url: 'https://www.reddit.com/r/all/',
    selectors: [
      'shreddit-app[pagetype="all"]',
      'shreddit-feed',
      'shreddit-post',
    ],
  },
  {
    name: 'Subreddit (/r/linux)',
    url: 'https://www.reddit.com/r/linux/',
    selectors: [
      'shreddit-app[pagetype="community"]',
      'shreddit-feed',
      'shreddit-post',
    ],
  },
];

// Known distracting Reddit elements that SHOULD be filtered but might not be
const KNOWN_REDDIT_DISTRACTIONS = [
  { selector: 'shreddit-ad-post', desc: 'Promoted/ad post in feed' },
  { selector: 'shreddit-sidebar-ad', desc: 'Sidebar ad' },
];

// X/Twitter pages to audit
const X_PAGES = [
  {
    name: 'Home',
    url: 'https://x.com/home',
    requiresAuth: true,
    selectors: [
      'div[data-testid="primaryColumn"]',
      'div[data-testid="sidebarColumn"]',
      'div[aria-label="Timeline: Your Home Timeline"]',
      'div[aria-label="Timeline: Trending now"]',
      'aside[aria-label="Who to follow"]',
    ],
  },
  {
    name: 'Profile (@elonmusk)',
    url: 'https://x.com/elonmusk',
    requiresAuth: false,
    selectors: [
      'div[data-testid="primaryColumn"]',
      'div[data-testid="sidebarColumn"]',
    ],
  },
];

// Known distracting X/Twitter elements that SHOULD be filtered but might not be
const KNOWN_X_DISTRACTIONS = [
  { selector: 'aside[aria-label="Subscribe to Premium"]', desc: 'Premium upsell sidebar' },
];

// ============================================================
// Color helpers
// ============================================================

const C = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ============================================================
// Cookie extraction
// ============================================================

function extractCookies() {
  // Copy to temp to avoid Firefox lock
  const tmpDb = path.join(os.tmpdir(), `audit-cookies-${Date.now()}.sqlite`);
  fs.copyFileSync(COOKIES_DB, tmpDb);

  const db = new Database(tmpDb, { readonly: true });
  const rows = db.prepare(`
    SELECT name, value, host, path, isSecure, isHttpOnly, sameSite, expiry
    FROM moz_cookies
    WHERE host LIKE '%youtube.com'
       OR host LIKE '%google.com'
       OR host LIKE '%reddit.com'
       OR host LIKE '%x.com'
  `).all();
  db.close();
  fs.unlinkSync(tmpDb);

  // Firefox sameSite: 0=None, 1=Lax, 2=Strict, 256=unset (treat as None)
  const sameSiteMap = { 0: 'None', 1: 'Lax', 2: 'Strict', 256: 'None' };

  return rows.map((row) => {
    // Firefox stores expiry as microseconds or milliseconds depending on version;
    // if the value is unreasonably large (>year 3000 in seconds), divide to get seconds
    let expires = row.expiry;
    if (expires > 32503680000) {
      // Likely microseconds (>year 3000 as seconds) — convert
      expires = Math.floor(expires / (expires > 32503680000000 ? 1000000 : 1000));
    }
    if (expires <= 0) expires = -1;

    return {
      name: row.name,
      value: row.value,
      domain: row.host,
      path: row.path,
      secure: !!row.isSecure,
      httpOnly: !!row.isHttpOnly,
      sameSite: sameSiteMap[row.sameSite] || 'None',
      expires,
    };
  });
}

// ============================================================
// Filter file parser
// ============================================================

function parseFilters() {
  const lines = fs.readFileSync(FILTER_FILE, 'utf8').split('\n');
  const cosmetic = [];
  const network = [];
  const exceptions = [];

  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('!')) continue;

    if (line.includes('##')) {
      const idx = line.indexOf('##');
      const domain = line.slice(0, idx);
      let selector = line.slice(idx + 2);

      // Extract :matches-path if present
      let matchesPath = null;
      const mpMatch = selector.match(/^:matches-path\(([^)]+)\)/);
      if (mpMatch) {
        matchesPath = mpMatch[1];
        selector = selector.slice(mpMatch[0].length);
      }

      // Extract :style() if present — not a querySelector selector
      let style = null;
      const styleMatch = selector.match(/:style\(([^)]+)\)$/);
      if (styleMatch) {
        style = styleMatch[1];
        selector = selector.slice(0, -styleMatch[0].length);
      }

      cosmetic.push({
        raw: line,
        domain,
        selector,
        matchesPath,
        style,
        // uBlock extended selectors that can't be tested with querySelectorAll
        isExtended: /(:has-text|:has\(|:upward|:matches-css)/.test(selector),
      });
    } else if (line.startsWith('@@')) {
      exceptions.push(line);
    } else if (line.startsWith('||') || line.startsWith('|')) {
      network.push(line);
    }
  }

  return { cosmetic, network, exceptions, allFilters: [...network, ...exceptions] };
}

// ============================================================
// DOM audit
// ============================================================

async function auditYouTubePages(context, cosmetics) {
  const report = [];
  const ytCosmetics = cosmetics.filter(
    (c) => c.domain === 'www.youtube.com' || c.domain === 'youtube.com' || c.domain === ''
  );

  for (const pageConfig of YOUTUBE_PAGES) {
    console.log(`\n  ${C.bold(pageConfig.name)} ${C.dim(pageConfig.url)}`);
    const page = await context.newPage();
    const pageResults = { page: pageConfig.name, url: pageConfig.url, selectors: [] };

    try {
      await page.goto(pageConfig.url, { timeout: PAGE_LOAD_TIMEOUT, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(SPA_RENDER_WAIT);

      // Test every YouTube cosmetic selector on this page
      for (const cosmetic of ytCosmetics) {
        // Skip extended selectors (can't be tested with querySelectorAll)
        if (cosmetic.isExtended) {
          // For :has() selectors, try to test the base selector at minimum
          const baseSelector = cosmetic.selector.split(':has(')[0].split(':has-text(')[0].split(':upward(')[0];
          if (baseSelector && baseSelector !== cosmetic.selector) {
            try {
              const count = await page.$$eval(baseSelector, (els) => els.length);
              const status = count > 0 ? 'base-valid' : 'base-missing';
              pageResults.selectors.push({
                filter: cosmetic.raw,
                selector: cosmetic.selector,
                baseSelector,
                status,
                count,
                extended: true,
              });
              const icon = count > 0 ? C.green('~') : C.yellow('?');
              console.log(`    ${icon} ${C.dim(cosmetic.selector.slice(0, 80))} ${C.dim(`(base: ${count} match${count !== 1 ? 'es' : ''})`)}`);
            } catch {
              pageResults.selectors.push({
                filter: cosmetic.raw,
                selector: cosmetic.selector,
                status: 'extended-untestable',
                extended: true,
              });
              console.log(`    ${C.dim('·')} ${C.dim(cosmetic.selector.slice(0, 80))} ${C.dim('(extended — untestable)')}`);
            }
          } else {
            pageResults.selectors.push({
              filter: cosmetic.raw,
              selector: cosmetic.selector,
              status: 'extended-untestable',
              extended: true,
            });
            console.log(`    ${C.dim('·')} ${C.dim(cosmetic.selector.slice(0, 80))} ${C.dim('(extended — untestable)')}`);
          }
          continue;
        }

        // Style-only filters — the selector part should still match
        const testSelector = cosmetic.selector;
        if (!testSelector) continue;

        try {
          const count = await page.$$eval(testSelector, (els) => els.length);
          const status = count > 0 ? 'valid' : 'no-match';
          pageResults.selectors.push({
            filter: cosmetic.raw,
            selector: testSelector,
            status,
            count,
          });
          const icon = count > 0 ? C.green('✓') : C.red('✗');
          console.log(`    ${icon} ${testSelector.slice(0, 80)} ${C.dim(`(${count})`)}`);
        } catch (e) {
          pageResults.selectors.push({
            filter: cosmetic.raw,
            selector: testSelector,
            status: 'error',
            error: e.message,
          });
          console.log(`    ${C.red('!')} ${testSelector.slice(0, 80)} ${C.red('(invalid selector)')}`);
        }
      }

      // Check for page-specific expected selectors
      console.log(`    ${C.dim('--- page-specific checks ---')}`);
      for (const sel of pageConfig.selectors) {
        try {
          const count = await page.$$eval(sel, (els) => els.length);
          const icon = count > 0 ? C.green('✓') : C.yellow('·');
          console.log(`    ${icon} ${sel} ${C.dim(`(${count})`)}`);
        } catch {
          console.log(`    ${C.red('!')} ${sel} ${C.red('(invalid)')}`);
        }
      }

      // Scan for known distractions not covered by filters
      console.log(`    ${C.dim('--- distraction scan ---')}`);
      for (const d of KNOWN_DISTRACTIONS) {
        try {
          // Only test non-extended selectors
          if (/(:has-text|:has\(|:upward)/.test(d.selector)) continue;
          const count = await page.$$eval(d.selector, (els) => els.length);
          if (count > 0) {
            // Check if any cosmetic filter already targets this
            const covered = ytCosmetics.some((c) => c.selector === d.selector || c.selector.includes(d.selector));
            if (!covered) {
              console.log(`    ${C.yellow('⚠')} ${C.yellow('UNCOVERED')}: ${d.desc} ${C.dim(`(${d.selector}, ${count} elements)`)}`);
              pageResults.selectors.push({
                selector: d.selector,
                status: 'missing',
                desc: d.desc,
                count,
              });
            }
          }
        } catch {
          // Invalid selector in distraction list — skip
        }
      }
    } catch (e) {
      console.log(`    ${C.red('ERROR')}: ${e.message}`);
      pageResults.error = e.message;
    }

    await page.close();
    report.push(pageResults);
  }

  return report;
}

// ============================================================
// Redundancy checker
// ============================================================

async function checkRedundancy(context, cosmetics) {
  const redundancies = [];
  const ytCosmetics = cosmetics.filter(
    (c) => !c.isExtended && !c.style && (c.domain === 'www.youtube.com' || c.domain === 'youtube.com')
  );

  // Group by selector to find exact duplicates
  const selectorMap = new Map();
  for (const c of ytCosmetics) {
    if (!selectorMap.has(c.selector)) selectorMap.set(c.selector, []);
    selectorMap.get(c.selector).push(c.raw);
  }
  for (const [sel, filters] of selectorMap) {
    if (filters.length > 1) {
      redundancies.push({ type: 'duplicate', selector: sel, filters });
    }
  }

  // Load a page and check which selectors hit the same elements
  const page = await context.newPage();
  try {
    await page.goto('https://www.youtube.com/results?search_query=shorts', {
      timeout: PAGE_LOAD_TIMEOUT,
      waitUntil: 'domcontentloaded',
    });
    await page.waitForTimeout(SPA_RENDER_WAIT);

    // For each pair of non-extended selectors, check if they select overlapping elements
    const validSelectors = [];
    for (const c of ytCosmetics) {
      try {
        const count = await page.$$eval(c.selector, (els) => els.length);
        if (count > 0) validSelectors.push(c);
      } catch {
        // skip invalid selectors
      }
    }

    // Check overlapping selectors (only among those that matched something)
    for (let i = 0; i < validSelectors.length; i++) {
      for (let j = i + 1; j < validSelectors.length; j++) {
        const a = validSelectors[i];
        const b = validSelectors[j];
        if (a.selector === b.selector) continue;
        try {
          const overlap = await page.evaluate(
            ([selA, selB]) => {
              const elsA = new Set(document.querySelectorAll(selA));
              const elsB = new Set(document.querySelectorAll(selB));
              let common = 0;
              for (const el of elsA) if (elsB.has(el)) common++;
              return { aCount: elsA.size, bCount: elsB.size, overlap: common };
            },
            [a.selector, b.selector]
          );
          if (overlap.overlap > 0 && (overlap.overlap === overlap.aCount || overlap.overlap === overlap.bCount)) {
            redundancies.push({
              type: 'overlap',
              selectorA: a.raw,
              selectorB: b.raw,
              overlap: overlap.overlap,
              aCount: overlap.aCount,
              bCount: overlap.bCount,
            });
          }
        } catch {
          // skip comparison errors
        }
      }
    }
  } catch (e) {
    console.log(`  ${C.yellow('WARN')}: redundancy check failed: ${e.message}`);
  }
  await page.close();

  return redundancies;
}

// ============================================================
// Reddit DOM audit
// ============================================================

async function auditRedditPages(context, cosmetics) {
  const report = [];
  const rdCosmetics = cosmetics.filter(
    (c) => c.domain === 'www.reddit.com' || c.domain === 'reddit.com' || c.domain === ''
  );

  for (const pageConfig of REDDIT_PAGES) {
    console.log(`\n  ${C.bold(pageConfig.name)} ${C.dim(pageConfig.url)}`);
    const page = await context.newPage();
    const pageResults = { page: pageConfig.name, url: pageConfig.url, selectors: [] };

    try {
      await page.goto(pageConfig.url, { timeout: PAGE_LOAD_TIMEOUT, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(SPA_RENDER_WAIT);

      // Test every Reddit cosmetic selector on this page
      for (const cosmetic of rdCosmetics) {
        if (cosmetic.isExtended) {
          const baseSelector = cosmetic.selector.split(':has(')[0].split(':has-text(')[0].split(':upward(')[0];
          if (baseSelector && baseSelector !== cosmetic.selector) {
            try {
              const count = await page.$$eval(baseSelector, (els) => els.length);
              const status = count > 0 ? 'base-valid' : 'base-missing';
              pageResults.selectors.push({
                filter: cosmetic.raw,
                selector: cosmetic.selector,
                baseSelector,
                status,
                count,
                extended: true,
              });
              const icon = count > 0 ? C.green('~') : C.yellow('?');
              console.log(`    ${icon} ${C.dim(cosmetic.selector.slice(0, 80))} ${C.dim(`(base: ${count} match${count !== 1 ? 'es' : ''})`)}`);
            } catch {
              pageResults.selectors.push({
                filter: cosmetic.raw,
                selector: cosmetic.selector,
                status: 'extended-untestable',
                extended: true,
              });
              console.log(`    ${C.dim('·')} ${C.dim(cosmetic.selector.slice(0, 80))} ${C.dim('(extended — untestable)')}`);
            }
          } else {
            pageResults.selectors.push({
              filter: cosmetic.raw,
              selector: cosmetic.selector,
              status: 'extended-untestable',
              extended: true,
            });
            console.log(`    ${C.dim('·')} ${C.dim(cosmetic.selector.slice(0, 80))} ${C.dim('(extended — untestable)')}`);
          }
          continue;
        }

        const testSelector = cosmetic.selector;
        if (!testSelector) continue;

        try {
          const count = await page.$$eval(testSelector, (els) => els.length);
          const status = count > 0 ? 'valid' : 'no-match';
          pageResults.selectors.push({
            filter: cosmetic.raw,
            selector: testSelector,
            status,
            count,
          });
          const icon = count > 0 ? C.green('✓') : C.red('✗');
          console.log(`    ${icon} ${testSelector.slice(0, 80)} ${C.dim(`(${count})`)}`);
        } catch (e) {
          pageResults.selectors.push({
            filter: cosmetic.raw,
            selector: testSelector,
            status: 'error',
            error: e.message,
          });
          console.log(`    ${C.red('!')} ${testSelector.slice(0, 80)} ${C.red('(invalid selector)')}`);
        }
      }

      // Check for page-specific expected selectors
      console.log(`    ${C.dim('--- page-specific checks ---')}`);
      for (const sel of pageConfig.selectors) {
        try {
          const count = await page.$$eval(sel, (els) => els.length);
          const icon = count > 0 ? C.green('✓') : C.yellow('·');
          console.log(`    ${icon} ${sel} ${C.dim(`(${count})`)}`);
        } catch {
          console.log(`    ${C.red('!')} ${sel} ${C.red('(invalid)')}`);
        }
      }

      // Scan for known distractions not covered by filters
      console.log(`    ${C.dim('--- distraction scan ---')}`);
      for (const d of KNOWN_REDDIT_DISTRACTIONS) {
        try {
          if (/(:has-text|:has\(|:upward)/.test(d.selector)) continue;
          const count = await page.$$eval(d.selector, (els) => els.length);
          if (count > 0) {
            const covered = rdCosmetics.some((c) => c.selector === d.selector || c.selector.includes(d.selector));
            if (!covered) {
              console.log(`    ${C.yellow('⚠')} ${C.yellow('UNCOVERED')}: ${d.desc} ${C.dim(`(${d.selector}, ${count} elements)`)}`);
              pageResults.selectors.push({
                selector: d.selector,
                status: 'missing',
                desc: d.desc,
                count,
              });
            }
          }
        } catch {
          // Invalid selector — skip
        }
      }
    } catch (e) {
      console.log(`    ${C.red('ERROR')}: ${e.message}`);
      pageResults.error = e.message;
    }

    await page.close();
    report.push(pageResults);
  }

  return report;
}

// ============================================================
// X/Twitter DOM audit
// ============================================================

async function auditXPages(context, cosmetics) {
  const report = [];
  const xCosmetics = cosmetics.filter(
    (c) => c.domain === 'x.com' || c.domain === ''
  );

  for (const pageConfig of X_PAGES) {
    console.log(`\n  ${C.bold(pageConfig.name)} ${C.dim(pageConfig.url)}`);
    const page = await context.newPage();
    const pageResults = { page: pageConfig.name, url: pageConfig.url, selectors: [] };

    try {
      await page.goto(pageConfig.url, { timeout: PAGE_LOAD_TIMEOUT, waitUntil: 'domcontentloaded' });
      await page.waitForTimeout(SPA_RENDER_WAIT);

      // Skip auth-required pages if redirected to login
      if (pageConfig.requiresAuth && page.url().includes('/login')) {
        console.log(`    ${C.dim('·')} ${C.dim('skipped — requires login')}`);
        await page.close();
        report.push(pageResults);
        continue;
      }

      // Test every X cosmetic selector on this page
      for (const cosmetic of xCosmetics) {
        if (cosmetic.isExtended) {
          const baseSelector = cosmetic.selector.split(':has(')[0].split(':has-text(')[0].split(':upward(')[0];
          if (baseSelector && baseSelector !== cosmetic.selector) {
            try {
              const count = await page.$$eval(baseSelector, (els) => els.length);
              const status = count > 0 ? 'base-valid' : 'base-missing';
              pageResults.selectors.push({
                filter: cosmetic.raw, selector: cosmetic.selector,
                baseSelector, status, count, extended: true,
              });
              const icon = count > 0 ? C.green('~') : C.yellow('?');
              console.log(`    ${icon} ${C.dim(cosmetic.selector.slice(0, 80))} ${C.dim(`(base: ${count} match${count !== 1 ? 'es' : ''})`)}`);
            } catch {
              pageResults.selectors.push({
                filter: cosmetic.raw, selector: cosmetic.selector,
                status: 'extended-untestable', extended: true,
              });
              console.log(`    ${C.dim('·')} ${C.dim(cosmetic.selector.slice(0, 80))} ${C.dim('(extended — untestable)')}`);
            }
          } else {
            pageResults.selectors.push({
              filter: cosmetic.raw, selector: cosmetic.selector,
              status: 'extended-untestable', extended: true,
            });
            console.log(`    ${C.dim('·')} ${C.dim(cosmetic.selector.slice(0, 80))} ${C.dim('(extended — untestable)')}`);
          }
          continue;
        }

        const testSelector = cosmetic.selector;
        if (!testSelector) continue;

        try {
          const count = await page.$$eval(testSelector, (els) => els.length);
          const status = count > 0 ? 'valid' : 'no-match';
          pageResults.selectors.push({
            filter: cosmetic.raw, selector: testSelector, status, count,
          });
          const icon = count > 0 ? C.green('✓') : C.red('✗');
          console.log(`    ${icon} ${testSelector.slice(0, 80)} ${C.dim(`(${count})`)}`);
        } catch (e) {
          pageResults.selectors.push({
            filter: cosmetic.raw, selector: testSelector, status: 'error', error: e.message,
          });
          console.log(`    ${C.red('!')} ${testSelector.slice(0, 80)} ${C.red('(invalid selector)')}`);
        }
      }

      // Check for page-specific expected selectors
      console.log(`    ${C.dim('--- page-specific checks ---')}`);
      for (const sel of pageConfig.selectors) {
        try {
          const count = await page.$$eval(sel, (els) => els.length);
          const icon = count > 0 ? C.green('✓') : C.yellow('·');
          console.log(`    ${icon} ${sel} ${C.dim(`(${count})`)}`);
        } catch {
          console.log(`    ${C.red('!')} ${sel} ${C.red('(invalid)')}`);
        }
      }

      // Scan for known distractions not covered by filters
      console.log(`    ${C.dim('--- distraction scan ---')}`);
      for (const d of KNOWN_X_DISTRACTIONS) {
        try {
          if (/(:has-text|:has\(|:upward)/.test(d.selector)) continue;
          const count = await page.$$eval(d.selector, (els) => els.length);
          if (count > 0) {
            const covered = xCosmetics.some((c) => c.selector === d.selector || c.selector.includes(d.selector));
            if (!covered) {
              console.log(`    ${C.yellow('⚠')} ${C.yellow('UNCOVERED')}: ${d.desc} ${C.dim(`(${d.selector}, ${count} elements)`)}`);
              pageResults.selectors.push({
                selector: d.selector, status: 'missing', desc: d.desc, count,
              });
            }
          }
        } catch {
          // Invalid selector — skip
        }
      }
    } catch (e) {
      console.log(`    ${C.red('ERROR')}: ${e.message}`);
      pageResults.error = e.message;
    }

    await page.close();
    report.push(pageResults);
  }

  return report;
}

// ============================================================
// Main
// ============================================================

async function main() {
  console.log(`\n${C.bold('═══ Filter Audit Report ═══')}\n`);
  console.log(`  Filter file: ${FILTER_FILE}`);
  console.log(`  Firefox profile: ${FIREFOX_PROFILE}`);

  // Step 1: Extract cookies
  console.log(`\n  ${C.bold('Extracting cookies...')}`);
  let cookies;
  try {
    cookies = extractCookies();
    const ytCookies = cookies.filter((c) => c.domain.includes('youtube') || c.domain.includes('google'));
    const rdCookies = cookies.filter((c) => c.domain.includes('reddit'));
    const xCookies = cookies.filter((c) => c.domain.includes('x.com'));
    console.log(`    ${C.green('✓')} ${cookies.length} cookies total (${ytCookies.length} YouTube/Google, ${rdCookies.length} Reddit, ${xCookies.length} X/Twitter)`);
  } catch (e) {
    console.error(`    ${C.red('✗')} Cookie extraction failed: ${e.message}`);
    console.error(`    Make sure Firefox is using profile at ${FIREFOX_PROFILE}`);
    process.exit(1);
  }

  // Step 2: Parse filter file
  console.log(`\n  ${C.bold('Parsing filter file...')}`);
  const { cosmetic, network, exceptions, allFilters } = parseFilters();
  console.log(`    ${cosmetic.length} cosmetic filters, ${network.length} network filters, ${exceptions.length} exceptions`);
  console.log(`    ${cosmetic.filter((c) => c.isExtended).length} use extended selectors (partial testability)`);

  // Step 3: Launch browser with cookies
  console.log(`\n  ${C.bold('Launching browser...')}`);
  const browser = await firefox.launch({ headless: true });
  const context = await browser.newContext({
    userAgent: 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  });
  await context.addCookies(cookies);
  console.log(`    ${C.green('✓')} Firefox launched with ${cookies.length} cookies injected`);

  // Step 4: Audit YouTube pages
  console.log(`\n${C.bold('─── YouTube Cosmetic Selectors ───')}`);
  const ytReport = await auditYouTubePages(context, cosmetic);

  // Step 5: Check redundancy
  console.log(`\n${C.bold('─── Redundancy Check ───')}`);
  const redundancies = await checkRedundancy(context, cosmetic);
  if (redundancies.length === 0) {
    console.log(`  ${C.green('✓')} No redundant selectors found`);
  } else {
    for (const r of redundancies) {
      if (r.type === 'duplicate') {
        console.log(`  ${C.yellow('⚠')} Duplicate selector: ${r.selector}`);
        for (const f of r.filters) console.log(`      ${C.dim(f)}`);
      } else {
        console.log(`  ${C.yellow('⚠')} Overlapping: ${C.dim(r.selectorA)} ↔ ${C.dim(r.selectorB)} (${r.overlap} shared elements)`);
      }
    }
  }

  // Step 6: Audit Reddit pages
  console.log(`\n${C.bold('─── Reddit Cosmetic Selectors ───')}`);
  const rdReport = await auditRedditPages(context, cosmetic);

  // Step 7: Audit X/Twitter pages
  console.log(`\n${C.bold('─── X/Twitter Cosmetic Selectors ───')}`);
  const xReport = await auditXPages(context, cosmetic);

  await browser.close();

  // =====================================================
  // Summary Report — aggregate per-filter across all pages
  // =====================================================
  console.log(`\n${C.bold('═══ Summary ═══')}\n`);

  // Helper: aggregate report across pages for a given site
  function aggregateReport(siteReport, siteName) {
    const filterAgg = new Map();
    const missingSelectors = [];

    for (const page of siteReport) {
      for (const s of page.selectors) {
        if (s.status === 'missing') {
          missingSelectors.push({ page: page.page, ...s });
          continue;
        }
        const key = s.filter || s.selector;
        if (!filterAgg.has(key)) {
          filterAgg.set(key, { filter: key, bestStatus: s.status, maxCount: s.count || 0, pages: [], extended: s.extended });
        }
        const agg = filterAgg.get(key);
        const rank = { valid: 4, 'base-valid': 3, 'no-match': 1, 'base-missing': 1, 'extended-untestable': 0, error: -1 };
        if ((rank[s.status] || 0) > (rank[agg.bestStatus] || 0)) {
          agg.bestStatus = s.status;
        }
        agg.maxCount = Math.max(agg.maxCount, s.count || 0);
        if ((s.count || 0) > 0) agg.pages.push(page.page);
      }
    }

    let validCount = 0, brokenCount = 0, extendedCount = 0, errorCount = 0;
    const brokenFilters = [];
    const validFilters = [];

    for (const [, agg] of filterAgg) {
      if (agg.bestStatus === 'valid' || agg.bestStatus === 'base-valid') {
        validCount++;
        validFilters.push(agg);
      } else if (agg.bestStatus === 'extended-untestable') {
        extendedCount++;
      } else if (agg.bestStatus === 'error') {
        errorCount++;
        brokenFilters.push(agg);
      } else {
        brokenCount++;
        brokenFilters.push(agg);
      }
    }

    console.log(`  ${siteName} cosmetic selectors (${filterAgg.size} unique filters across ${siteReport.length} pages):`);
    console.log(`    ${C.green(`${validCount} valid`)} | ${C.red(`${brokenCount} broken`)} | ${C.yellow(`${extendedCount} extended (partial)`)} | ${errorCount} errors`);

    if (validFilters.length > 0) {
      console.log(`\n  ${C.green('Valid selectors (matched on at least one page):')}`);
      for (const f of validFilters) {
        console.log(`    ${C.green('✓')} ${f.filter.slice(0, 100)} ${C.dim(`(${f.maxCount} on ${f.pages.join(', ')})`)}`);
      }
    }

    if (brokenFilters.length > 0) {
      console.log(`\n  ${C.red('Broken selectors (matched ZERO elements on ALL pages):')}`);
      for (const f of brokenFilters) {
        console.log(`    ${C.red('✗')} ${f.filter}`);
      }
    }

    if (missingSelectors.length > 0) {
      const seen = new Set();
      console.log(`\n  ${C.yellow('Missing filters (uncovered distractions):')}`);
      for (const s of missingSelectors) {
        const key = s.selector;
        if (seen.has(key)) continue;
        seen.add(key);
        console.log(`    ${C.yellow('⚠')} ${s.desc} — ${s.selector} ${C.dim(`(found on ${s.page})`)}`);
      }
    }

    return { brokenCount, errorCount };
  }

  // YouTube summary
  const ytSummary = aggregateReport(ytReport, 'YouTube');

  if (redundancies.length > 0) {
    console.log(`\n  ${C.yellow(`${redundancies.length} redundanc${redundancies.length === 1 ? 'y' : 'ies'} found`)}`);
  }

  // Reddit summary
  console.log('');
  const rdSummary = aggregateReport(rdReport, 'Reddit');

  // X/Twitter summary
  console.log('');
  const xSummary = aggregateReport(xReport, 'X/Twitter');

  // Exit code
  const totalFailed = ytSummary.brokenCount + ytSummary.errorCount + rdSummary.brokenCount + rdSummary.errorCount + xSummary.brokenCount + xSummary.errorCount;
  console.log(`\n  ${totalFailed === 0 ? C.green('All checks passed!') : C.red(`${totalFailed} issue(s) to review`)}\n`);
  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(`\n  ${C.red('Fatal error')}: ${e.message}\n`);
  process.exit(1);
});
