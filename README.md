# uBlock Origin Social Media Filters

Custom filter list for [uBlock Origin](https://ublockorigin.com/) that blocks distracting social media while preserving useful content on YouTube and Reddit.

## What it does

### Fully blocked
Instagram, TikTok, Facebook, Twitter/X, Snapchat, Pinterest, Threads, Tumblr

### YouTube (selective)
- **Blocked**: Homepage feed, Shorts, recommendation sidebar, end-screen suggestions
- **Allowed**: Search, video pages, channels, subscriptions, playlists, history

### Reddit (selective)
- **Blocked**: Homepage, `/r/popular`, `/r/all`
- **Allowed**: Subreddits (`/r/*`), user profiles, posts, search, settings, messaging

## How to use

1. Install [uBlock Origin](https://ublockorigin.com/) in Firefox (or Chromium)
2. Click the uBlock Origin icon → gear icon (dashboard)
3. Go to the **"My filters"** tab
4. Paste the contents of [`ublock-social-media-filters.txt`](ublock-social-media-filters.txt)
5. Click **"Apply changes"**

## Optional: Subscribe to YouTube Shorts filter list

For auto-updating Shorts filters as YouTube changes their DOM:

1. Dashboard → **"Filter lists"** tab
2. Scroll to bottom → **"Import..."**
3. Paste: `https://raw.githubusercontent.com/gijsdev/ublock-hide-yt-shorts/master/list.txt`
4. Click **"Apply changes"**

## Credits

Shorts cosmetic filters adapted from [ublock-hide-yt-shorts](https://github.com/gijsdev/ublock-hide-yt-shorts).
