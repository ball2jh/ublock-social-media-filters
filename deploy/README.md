# Hardening

Makes the filter list hard to switch off. One file is edited by hand --
`ublock-social-media-filters.txt` -- and everything here is generated from it.

```
ublock-social-media-filters.txt   (published)
deploy/local-blocks.txt           (gitignored, optional)
  |
  |-- gen-usercontent.js --> userContent.css              (Firefox user stylesheet)
  |-- gen-policy.js      --> firefox-policies.json        (uBO rules + WebsiteFilter)
  '-- gen-adguard.js     --> adguardhome-user-rules.txt   (DNS layer)
```

The three generated files are gitignored: they embed `local-blocks.txt`, so
committing them would publish it. `firefox-policies.base.json` holds the
hand-maintained policy keys and is tracked; `gen-policy.js` copies it, replaces
uBO's managed **My filters** with the source rules, and adds `WebsiteFilter`.
Edit the base file, never the built one.

`local-blocks.txt` uses the same uBO syntax and feeds the same layers. It is for
rules that belong on this machine but not in a public filter list. Both files
are read by every generator, so a rule still lives in exactly one place.

## Use

```
./deploy/deploy.sh                # everything below in one go (asks for sudo once)
./deploy/deploy.sh --lock         # ...and set immutable bits
```

To skip even that, install a watcher that runs `deploy.sh` whenever
`ublock-social-media-filters.txt` or `local-blocks.txt` is saved:

```
sudo ./deploy/install-watch.sh            # systemd path unit, survives reboot
sudo ./deploy/install-watch.sh --remove
journalctl -u ublock-social-media-filters-deploy.service   # see what a save did
```

Each save restarts AdGuard Home when the DNS rules changed, and Firefox still
needs a restart to pick up new rules.

Or step by step:

```
./deploy/generate.sh              # after any edit to the filter list
sudo ./deploy/install.sh          # Firefox policy + user stylesheet
sudo ./deploy/install.sh --lock   # ...and set immutable bits
sudo ./deploy/install-adguard.sh --check   # show what would change
sudo ./deploy/install-adguard.sh           # merge into user_rules (restarts DNS)
```

`install.sh` refuses to run if a generated file is older than the filter list,
so the layers cannot drift apart. Restart Firefox afterwards, then check
`about:policies` -- the Errors tab should be empty, and `about:addons` should
show uBO with no toggle and no Remove button. At startup, the policy replaces
uBO's **My filters** with the current local source. It also carries `badfilter`
migrations for the three retired whole-domain Twitch rules. Those migrations
neutralize stale copies in an older subscribed list without changing the
user's other selected lists.

## Bulk blocklists

Large third-party lists (hundreds of thousands of domains) do not belong in
`local-blocks.txt`: every rule there also lands in Firefox's `WebsiteFilter`,
which is capped at 1,000 entries, and in uBO's My filters. Subscribe to them in
AdGuard Home instead (Filters -> DNS blocklists, or the `filters:` key in
`AdGuardHome.yaml`). AdGuard indexes them itself, auto-updates them, and lookup
cost does not grow with list size.

## Using the DNS layer from other devices

AdGuard Home ships bound to `127.0.0.1`, so only this machine can query it.

```
sudo ./deploy/enable-lan-dns.sh --check   # show what would change
sudo ./deploy/enable-lan-dns.sh           # bind to the LAN (restarts DNS)
```

This binds to `0.0.0.0` and sets `allowed_clients` to loopback plus the local
subnet, so it answers LAN devices but is not an open resolver. Reserve this
machine's address in the router's DHCP settings first -- the binding is to all
interfaces, but the phone points at a fixed IP.

Then set the phone's Wi-Fi DNS to that address. Two things to know: it only
applies on this Wi-Fi network, and if this machine is off the phone has no
resolver at all. Adding a fallback DNS on the phone fixes that and defeats the
blocking, so there is no free lunch.

DNS resolves names, not paths. Phones get the whole-domain blocks only -- the
route blocks and cosmetics need Firefox for Android with uBO subscribed to the
published list.

## Which rule feeds which layer

| Filter list syntax | Becomes |
| --- | --- |
| `\|\|domain^` | AdGuard Home rule, and `*://*.domain/*` in `WebsiteFilter` |
| `\|\|domain/path$document` | `*://*.domain/path*` in `WebsiteFilter` |
| `\|https://host/\|$document` | that exact URL in `WebsiteFilter` |
| `domain##selector` | a `userContent.css` rule |

Whole-domain blocks land in `WebsiteFilter` as well as DNS on purpose: a VPN
routes around AdGuard Home, and `WebsiteFilter` still fires.

`install-adguard.sh` tracks the rules it installs in
`/var/lib/adguardhome/ublock-social-media-filters-managed.txt`. Each run adds
new source rules and removes managed rules that disappeared from the source.
Unrelated `user_rules` remain untouched. The first tracked run also removes the
three obsolete Twitch domain rules left by older versions of this installer.

## What the policy does

| Key | Effect |
| --- | --- |
| `ExtensionSettings` / `force_installed` | uBO cannot be disabled or removed from `about:addons` |
| `private_browsing: true` | uBO stays active in private windows |
| `DisableSafeMode` | closes Troubleshoot Mode, which disables all extensions |
| `WebsiteFilter` | Firefox itself refuses to load the blocked URLs |
| `Preferences` | locks on the pref that loads `userContent.css` |
| `toOverwrite.filters` | replaces uBO's My filters with the current generated rules at every launch |
| `toOverwrite.trustedSiteDirectives` | rewrites uBO's trusted-site list at every launch |

## The power button

uBO's popup power button cannot be hidden. In uBO 1.73 the `#switch` element
lives in `#sticky` with no `data-more` attribute, so it sits outside the section
system that `disabledPopupPanelParts` controls -- no managed-storage key reaches
it. Three things blunt it instead:

- `WebsiteFilter` blocks URLs at the browser level. Toggling uBO off reloads the
  tab, and that reload is a top-level navigation, so the block still fires.
- `userContent.css` re-applies the cosmetic rules as a Firefox user stylesheet.
  Firefox paints it, not uBO, so switching uBO off leaves it in place.
- `toOverwrite.trustedSiteDirectives` wipes whatever the button whitelisted at
  the next Firefox start. It also wipes trusted sites added on purpose -- add
  those to the array in `firefox-policies.json`, which `gen-policy.js` leaves
  alone.

## Known gaps

- **`:has-text()` rules.** Text matching has no CSS equivalent, so 12 cosmetic
  rules stay uBO-only and the power button still reaches them. They are listed
  in a comment at the foot of `userContent.css`.
- **In-page SPA navigation.** Clicking Home inside X changes route without a
  document load, so `WebsiteFilter` never sees it. The `userContent.css` rules
  cover that case.
- **Chrome.** uBO proper doesn't run there (MV2). AdGuard Home covers the
  whole-domain blocks; the route blocks and cosmetics do not apply. A Chromium
  `URLBlocklist` policy generated from the same list would close this.

## Remove

```
sudo ./deploy/uninstall.sh   # policy + stylesheet; AdGuard Home is left alone
```
