#!/usr/bin/env bash
# Make AdGuard Home reachable from other devices on the LAN.
#
# It ships bound to 127.0.0.1, so only this machine can use it. This rebinds it
# to all interfaces and restricts which clients may query, so it stays a private
# resolver rather than an open one.
#
# Usage: sudo ./deploy/enable-lan-dns.sh [--check]
set -euo pipefail

CONF=/var/lib/adguardhome/AdGuardHome.yaml
LAN_CIDR=$(ip -4 -brief addr show | awk '$1!="lo" && $1!~/docker/ {print $3; exit}')
LAN_IP=${LAN_CIDR%%/*}

[[ $EUID -eq 0 ]] || { echo "must run as root: sudo $0 $*" >&2; exit 1; }
[[ -f "$CONF" ]] || { echo "missing $CONF" >&2; exit 1; }
[[ -n "$LAN_IP" ]] || { echo "could not determine LAN address" >&2; exit 1; }

CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

echo "LAN address: $LAN_IP  (subnet $(ipcalc -n "$LAN_CIDR" 2>/dev/null | awk -F= '/NETWORK/{print $2}' || echo "${LAN_IP%.*}.0/24"))"

patch() {
  python3 - "$CONF" "${LAN_IP%.*}.0/24" "$1" <<'PY'
import re, sys, yaml

conf_path, subnet, mode = sys.argv[1], sys.argv[2], sys.argv[3]
text = open(conf_path).read()
lines = text.split("\n")

def replace_list(lines, key, values):
    start = next((i for i, l in enumerate(lines) if re.match(rf"^(\s*){key}:", l)), None)
    if start is None:
        sys.exit(f"no {key}: key in config")
    indent = re.match(r"^(\s*)", lines[start]).group(1)
    end = start + 1
    while end < len(lines):
        l = lines[end]
        if l.strip() and not re.match(rf"^{indent}\s+", l):
            break
        end += 1
    body = [f"{indent}  - {v}" for v in values]
    return lines[:start] + [f"{indent}{key}:"] + body + lines[end:]

current = yaml.safe_load(text)
print(f"  bind_hosts now:     {current['dns'].get('bind_hosts')}")
print(f"  allowed_clients now: {current['dns'].get('allowed_clients')}")
print(f"  -> bind_hosts:      ['0.0.0.0']")
print(f"  -> allowed_clients: ['127.0.0.1', '{subnet}']")

if mode == "check":
    sys.exit(0)

lines = replace_list(lines, "bind_hosts", ["0.0.0.0"])
lines = replace_list(lines, "allowed_clients", ["127.0.0.1", subnet])
new_text = "\n".join(lines)

doc = yaml.safe_load(new_text)
assert doc["dns"]["bind_hosts"] == ["0.0.0.0"], doc["dns"]["bind_hosts"]
assert doc["dns"]["allowed_clients"] == ["127.0.0.1", subnet], doc["dns"]["allowed_clients"]
open(conf_path, "w").write(new_text)
PY
}

if (( CHECK )); then patch check; exit 0; fi

BAK="$CONF.bak.$(date +%Y%m%d%H%M%S)"
cp -a "$CONF" "$BAK"
systemctl stop adguardhome
if ! patch write; then
  cp -a "$BAK" "$CONF"; systemctl start adguardhome
  echo "patch failed -- config restored from $BAK" >&2; exit 1
fi
systemctl start adguardhome
sleep 1
if ! systemctl is-active --quiet adguardhome; then
  cp -a "$BAK" "$CONF"; systemctl start adguardhome
  echo "adguardhome failed to start -- restored $BAK" >&2; exit 1
fi

# Open port 53 only if something is actually filtering.
if iptables -S INPUT 2>/dev/null | grep -q -- '-P INPUT DROP\|-j REJECT'; then
  for proto in udp tcp; do
    iptables -C INPUT -p $proto --dport 53 -s "${LAN_IP%.*}.0/24" -j ACCEPT 2>/dev/null \
      || iptables -I INPUT -p $proto --dport 53 -s "${LAN_IP%.*}.0/24" -j ACCEPT
  done
  echo "opened port 53 to ${LAN_IP%.*}.0/24 (not persisted across reboot)"
else
  echo "no restrictive firewall policy found -- nothing to open"
fi

ss -tulnp | grep ':53 ' || true
echo
echo "point your phone's Wi-Fi DNS at $LAN_IP"
echo "reserve $LAN_IP for this machine in your router's DHCP settings first"
