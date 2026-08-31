#!/usr/bin/env bash
# Install a systemd watcher that runs deploy.sh whenever a rule file changes.
# Usage: sudo ./deploy/install-watch.sh [--remove]
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$DIR/.." && pwd)"
NAME=ublock-social-media-filters-deploy
UNIT_DIR=/etc/systemd/system

[[ $EUID -eq 0 ]] || { echo "must run as root: sudo $0 $*" >&2; exit 1; }

if [[ "${1:-}" == "--remove" ]]; then
  systemctl disable --now "$NAME.path" 2>/dev/null || true
  rm -f "$UNIT_DIR/$NAME.path" "$UNIT_DIR/$NAME.service"
  systemctl daemon-reload
  echo "removed $NAME watcher"
  exit 0
fi

touch "$DIR/local-blocks.txt"
chown "$(stat -c %U:%G "$DIR")" "$DIR/local-blocks.txt"

cat > "$UNIT_DIR/$NAME.service" <<UNIT
[Unit]
Description=Deploy ublock-social-media-filters rules

[Service]
Type=oneshot
ExecStart=$DIR/deploy.sh
UNIT

cat > "$UNIT_DIR/$NAME.path" <<UNIT
[Unit]
Description=Redeploy ublock-social-media-filters when a rule file changes

[Path]
PathChanged=$ROOT/ublock-social-media-filters.txt
PathChanged=$DIR/local-blocks.txt
Unit=$NAME.service

[Install]
WantedBy=multi-user.target
UNIT

systemctl daemon-reload
systemctl enable --now "$NAME.path"
echo "watching $ROOT/ublock-social-media-filters.txt and $DIR/local-blocks.txt"
echo "logs: journalctl -u $NAME.service"
