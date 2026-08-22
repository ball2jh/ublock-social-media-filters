#!/usr/bin/env bash
# Force-install uBlock Origin via Firefox enterprise policy.
# Usage: sudo ./deploy/install.sh [--lock]
#   --lock  also set the immutable bit on policies.json (chattr +i)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC="$DIR/firefox-policies.json"
LIST="$(cd "$DIR/.." && pwd)/ublock-social-media-filters.txt"

# Everything under deploy/ is derived from the rule sources. Refuse to install a
# stale copy rather than silently deploying yesterday's rules.
for f in firefox-policies.json userContent.css adguardhome-user-rules.txt; do
  if [[ ! -f "$DIR/$f" ]]; then
    echo "$f is missing -- run ./deploy/generate.sh" >&2
    exit 1
  fi
  for src in "$LIST" "$DIR/local-blocks.txt"; do
    if [[ -f "$src" && "$src" -nt "$DIR/$f" ]]; then
      echo "$f is older than $(basename "$src") -- run ./deploy/generate.sh" >&2
      exit 1
    fi
  done
done
DEST_DIR=/etc/firefox/policies
DEST="$DEST_DIR/policies.json"

[[ $EUID -eq 0 ]] || { echo "must run as root: sudo $0 $*" >&2; exit 1; }

LOCK=0
[[ "${1:-}" == "--lock" ]] && LOCK=1

install -d -m 0755 -o root -g root "$DEST_DIR"

if [[ -e "$DEST" ]]; then
  chattr -i "$DEST" 2>/dev/null || true
  if ! cmp -s "$SRC" "$DEST"; then
    BAK="$DEST.bak.$(date +%Y%m%d%H%M%S)"
    cp -a "$DEST" "$BAK"
    echo "backed up existing policy -> $BAK"
  fi
fi

install -m 0644 -o root -g root "$SRC" "$DEST"
(( LOCK )) && chattr +i "$DEST"
echo "installed $DEST"

# userContent.css carries the cosmetic rules that uBO's power button can switch
# off. Firefox applies it directly, so the button has no reach.
CSS="$DIR/userContent.css"
HOME_DIR=$(getent passwd "${SUDO_USER:-$USER}" | cut -d: -f6)
PROFILE_INI="$HOME_DIR/.mozilla/firefox/profiles.ini"

if [[ -f "$PROFILE_INI" ]]; then
  PROFILE=$(awk -F= '/^Path=/{p=$2} /^Default=1/{print p}' "$PROFILE_INI" | head -1)
  CHROME_DIR="$HOME_DIR/.mozilla/firefox/$PROFILE/chrome"
  chattr -i "$CHROME_DIR" "$CHROME_DIR/userContent.css" 2>/dev/null || true
  install -d -m 0755 -o root -g root "$CHROME_DIR"
  install -m 0644 -o root -g root "$CSS" "$CHROME_DIR/userContent.css"
  (( LOCK )) && chattr +i "$CHROME_DIR/userContent.css" "$CHROME_DIR"
  echo "installed $CHROME_DIR/userContent.css"
else
  echo "skipped userContent.css (no $PROFILE_INI)" >&2
fi

(( LOCK )) && echo "immutable bits set (undo: sudo ./deploy/uninstall.sh)"
echo
echo "restart Firefox, then confirm at about:policies and about:addons"
echo "for the DNS layer: sudo ./deploy/install-adguard.sh"
