# uBlock Origin Social Media Filters

Custom filter list for [uBlock Origin](https://ublockorigin.com/) that blocks distracting social media while preserving the useful parts of YouTube, Reddit, X/Twitter, Twitch, and Kick.

The list removes endless-scroll entry points while leaving search, direct links, and deliberate navigation intact. Feed and homepage URLs are blocked outright. Distracting content reached through in-app navigation is hidden.

## What it does

### Fully blocked
Instagram, TikTok, Facebook, Snapchat, Pinterest, Threads, Tumblr, and the old `twitter.com` domain.

### Twitch and Kick

| | |
| --- | --- |
| **Blocked outright** | Both homepages, both search pages, Twitch `/directory`, Kick `/browse`, and Kick `/category` |
| **Hidden on other pages** | The left sidebar, its toggle, and the site search control |
| **Untouched** | Direct channel pages, videos, and clips |

Use Google or a direct channel URL instead of browsing either site.

### YouTube
| | |
| --- | --- |
| **Blocked outright** | Homepage (`youtube.com` and `m.youtube.com`), Shorts, live streams, `/feed/trending` |
| **Hidden on other pages** | Recommendation sidebar, end-screen suggestions, the autoplay "Up next" countdown card, Shorts shelves and chips, live-badged videos, the subscribed-channel list in the sidebar |
| **Untouched** | Search, video pages, channels, playlists, history, and the `/feed/subscriptions` page |

Since the homepage is blocked, enter via `youtube.com/feed/subscriptions` or a search URL.

### Reddit
| | |
| --- | --- |
| **Blocked outright** | Homepage (`www` and `old`), `/r/popular`, `/r/all`, `/best` |
| **Hidden on other pages** | Feeds anywhere that isn't a subreddit or a post, gallery carousel, recent posts, games drawer, sidebar ads and promoted posts |
| **Untouched** | Subreddits, user profiles, posts, search, settings, messaging |

### X/Twitter
| | |
| --- | --- |
| **Blocked outright** | `/`, `/home`, `/explore`, `/notifications`, `/i/trending`, `/i/grok` |
| **Hidden on other pages** | Sidebar nav links to those routes, trending panel, "Relevant people", "Creators for you", Grok drawer, Premium upsell, promoted tweets, the new-posts pill |
| **Untouched** | Profiles, individual tweets, DMs, search, bookmarks |

Blocked routes show uBlock Origin's block page. Some are also hidden cosmetically, because in-app navigation on these sites is a client-side route change that never triggers a page load.

## How to use

1. Install [uBlock Origin](https://ublockorigin.com/) in Firefox
2. Click the uBlock Origin icon → gear icon (dashboard)
3. Go to the **Filter lists** tab
4. Scroll to the bottom and click **Import...**
5. Paste this URL and click **Apply changes**:
   ```
   https://raw.githubusercontent.com/ball2jh/ublock-social-media-filters/main/ublock-social-media-filters.txt
   ```

The list auto-updates every 2 weeks. To force an update, click **Purge all caches** then **Update now** on the Filter lists tab.

## Making it stick

A filter list is trivially switched off — that is the point of an ad blocker, and the opposite of what you want from a distraction blocker. [`deploy/`](deploy/) contains an optional setup for Linux + Firefox that pushes the same rules into layers uBlock Origin's power button cannot reach: a Firefox enterprise policy that force-installs the extension, keeps uBlock's **My filters** synchronized with this repo, and blocks the URLs itself; a user stylesheet that carries the cosmetic rules; and AdGuard Home rules for the whole-domain blocks.

Every layer is generated from this one filter list. See [`deploy/README.md`](deploy/README.md).

## Development

```
node validate-filters.js    # check syntax
node test-filters.js        # test against live pages (Playwright)
node audit-filters.js       # audit selectors for staleness
```

## Credits

Shorts cosmetic filters adapted from [ublock-hide-yt-shorts](https://github.com/gijsdev/ublock-hide-yt-shorts).
