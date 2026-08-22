#!/usr/bin/env bash
# Remove the Firefox policy. This is the sanctioned escape hatch --
# if you find yourself running it on impulse, add a `sleep 1200` here.
set -euo pipefail
DEST=/etc/firefox/policies/policies.json
[[ $EUID -eq 0 ]] || { echo "must run as root: sudo $0" >&2; exit 1; }
chattr -i "$DEST" 2>/dev/null || true
rm -f "$DEST"
echo "removed $DEST"

HOME_DIR=$(getent passwd "${SUDO_USER:-$USER}" | cut -d: -f6)
PROFILE_INI="$HOME_DIR/.mozilla/firefox/profiles.ini"
if [[ -f "$PROFILE_INI" ]]; then
  PROFILE=$(awk -F= '/^Path=/{p=$2} /^Default=1/{print p}' "$PROFILE_INI" | head -1)
  CHROME_DIR="$HOME_DIR/.mozilla/firefox/$PROFILE/chrome"
  chattr -i "$CHROME_DIR" "$CHROME_DIR/userContent.css" 2>/dev/null || true
  rm -f "$CHROME_DIR/userContent.css"
  chown -R "${SUDO_USER:-$USER}" "$CHROME_DIR" 2>/dev/null || true
  echo "removed $CHROME_DIR/userContent.css"
fi
echo "restart Firefox"
