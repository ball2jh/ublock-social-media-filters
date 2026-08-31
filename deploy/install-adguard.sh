#!/usr/bin/env bash
# Sync generated domain rules into AdGuard Home's user_rules.
#
# Rules installed by this repo are tracked in a state file. Removed source rules
# disappear from AdGuard Home on the next run. Unrelated user rules stay intact.
#
# Usage: sudo ./deploy/install-adguard.sh [--check]
#   --check  report the diff and exit without writing or restarting anything
set -euo pipefail

DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RULES="$DIR/adguardhome-user-rules.txt"
MERGER="$DIR/merge-adguard-rules.py"
CONF=/var/lib/adguardhome/AdGuardHome.yaml
STATE=/var/lib/adguardhome/ublock-social-media-filters-managed.txt

[[ $EUID -eq 0 ]] || { echo "must run as root: sudo $0 $*" >&2; exit 1; }
[[ -f "$RULES" ]] || { echo "missing $RULES -- run ./deploy/generate.sh" >&2; exit 1; }
[[ -f "$MERGER" ]] || { echo "missing $MERGER" >&2; exit 1; }
[[ -f "$CONF" ]] || { echo "missing $CONF" >&2; exit 1; }

CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

merge() {
  python3 "$MERGER" "$CONF" "$RULES" "$STATE" "$1"
}

if (( CHECK )); then
  merge check
  exit 0
fi

STAMP=$(date +%Y%m%d%H%M%S)
BAK="$CONF.bak.$STAMP"
STATE_BAK="$STATE.bak.$STAMP"
cp -a "$CONF" "$BAK"
HAD_STATE=0
if [[ -f "$STATE" ]]; then
  cp -a "$STATE" "$STATE_BAK"
  HAD_STATE=1
fi

restore() {
  cp -a "$BAK" "$CONF"
  if (( HAD_STATE )); then
    cp -a "$STATE_BAK" "$STATE"
  else
    rm -f "$STATE"
  fi
}

# AdGuard Home rewrites its config on shutdown, so it has to be stopped for the
# edit. DNS is down for a second or two.
systemctl stop adguardhome

set +e
merge write
STATUS=$?
set -e

if (( STATUS == 3 )); then
  systemctl start adguardhome
  rm -f "$BAK" "$STATE_BAK"
  echo "nothing to change -- AdGuard Home rules are current"
  exit 0
elif (( STATUS != 0 )); then
  restore
  systemctl start adguardhome
  echo "sync failed -- config restored from $BAK" >&2
  exit 1
fi

systemctl start adguardhome
sleep 1
if systemctl is-active --quiet adguardhome; then
  rm -f "$STATE_BAK"
  echo "adguardhome restarted (backup: $BAK)"
else
  echo "adguardhome failed to start -- restoring $BAK" >&2
  restore
  systemctl start adguardhome
  exit 1
fi
