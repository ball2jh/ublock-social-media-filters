# uBlock Origin Social Media Filters

Custom filter list for [uBlock Origin](https://ublockorigin.com/) that blocks distracting social media while preserving useful content on YouTube, Reddit, and X/Twitter.

## What it does

### Fully blocked
Instagram, TikTok, Facebook, Snapchat, Pinterest, Threads, Tumblr, Twitch

### YouTube (selective)
- **Blocked**: Homepage feed, Shorts, recommendation sidebar, end-screen suggestions
- **Allowed**: Search, video pages, channels, subscriptions, playlists, history

### Reddit (selective)
- **Blocked**: Homepage feed, `/r/popular`, `/r/all`, trending carousel, sidebar ads
- **Allowed**: Subreddits (`/r/*`), user profiles, posts, search, settings, messaging

### X/Twitter (selective)
- **Blocked**: Home timeline feed, explore feed, notifications feed, trending sidebar, "Who to follow", promoted tweets, Grok, Premium upsell
- **Allowed**: Profiles, individual tweets, DMs, search, bookmarks

## How to use

1. Install [uBlock Origin](https://ublockorigin.com/) in Firefox (or Chromium)
2. Click the uBlock Origin icon → gear icon (dashboard)
3. Go to the **"Filter lists"** tab
4. Scroll to the bottom and click **"Import..."**
5. Paste this URL and click **"Apply changes"**:
   ```
   https://raw.githubusercontent.com/ball2jh/ublock-social-media-filters/main/ublock-social-media-filters.txt
   ```

The filter list will auto-update every 2 weeks. To force an update, click **"Purge all caches"** then **"Update now"** on the Filter lists tab.

## Credits

Shorts cosmetic filters adapted from [ublock-hide-yt-shorts](https://github.com/gijsdev/ublock-hide-yt-shorts).
