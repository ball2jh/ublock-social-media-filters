#!/usr/bin/env bash
# One-shot deploy: regenerate, install the Firefox policy + stylesheet, and
# sync AdGuard Home. Prompts for sudo once.
# Usage: ./deploy/deploy.sh [--lock]
#   --lock  passed to install.sh (immutable bits on the installed files)
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

if [[ $EUID -ne 0 ]]; then
  exec sudo "$0" "$@"
fi

# Generate as the repo owner so the derived files never become root-owned
# (SUDO_USER is empty when run from the systemd watcher).
OWNER="${SUDO_USER:-$(stat -c %U "$DIR")}"
if [[ "$OWNER" != root ]]; then
  sudo -u "$OWNER" "$DIR/generate.sh"
else
  "$DIR/generate.sh"
fi

"$DIR/install.sh" "$@"
echo
"$DIR/install-adguard.sh"
echo
echo "deployed -- restart Firefox to pick up the new rules"
