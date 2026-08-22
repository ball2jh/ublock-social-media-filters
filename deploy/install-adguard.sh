#!/usr/bin/env bash
# Merge the generated domain rules into AdGuard Home's user_rules.
#
# Existing rules are preserved verbatim, comments included. Only rules whose
# domain is not already mentioned get appended, and anything present in AdGuard
# Home but absent from the filter list is reported rather than removed.
#
# Usage: sudo ./deploy/install-adguard.sh [--check]
#   --check  report the diff and exit without writing or restarting anything
set -euo pipefail

RULES="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)/adguardhome-user-rules.txt"
CONF=/var/lib/adguardhome/AdGuardHome.yaml

[[ $EUID -eq 0 ]] || { echo "must run as root: sudo $0 $*" >&2; exit 1; }
[[ -f "$RULES" ]] || { echo "missing $RULES -- run ./deploy/generate.sh" >&2; exit 1; }
[[ -f "$CONF" ]] || { echo "missing $CONF" >&2; exit 1; }

CHECK=0
[[ "${1:-}" == "--check" ]] && CHECK=1

merge() {
  python3 - "$CONF" "$RULES" "$1" <<'PY'
import re, sys

conf_path, rules_path, mode = sys.argv[1], sys.argv[2], sys.argv[3]
lines = open(conf_path).read().split("\n")

start = next((i for i, l in enumerate(lines) if re.match(r"^(\s*)user_rules:", l)), None)
if start is None:
    sys.exit("no user_rules: key in config")

indent = re.match(r"^(\s*)", lines[start]).group(1)
end = start + 1
while end < len(lines):
    l = lines[end]
    if l.strip() and not re.match(rf"^{indent}\s+", l):
        break
    end += 1

# Existing entries, kept exactly as written.
existing = []
for l in lines[start + 1:end]:
    m = re.match(r"^\s*-\s*(.*)$", l)
    if m:
        existing.append(m.group(1).strip().strip('"\''))

def domain(rule):
    m = re.match(r"^\|\|([\w.-]+)\^", rule)
    return m.group(1) if m else None

covered = {d for d in (domain(r) for r in existing) if d}
generated = [l.strip() for l in open(rules_path) if l.strip()]

added = [r for r in generated if domain(r) and domain(r) not in covered]
present = [r for r in generated if domain(r) and domain(r) in covered]
theirs = [r for r in existing if domain(r) not in {domain(g) for g in generated}]

print(f"  {len(existing)} rules already in AdGuard Home")
print(f"  {len(present)} of ours already covered")
print(f"  {len(added)} to add")
for r in added:
    print(f"    + {r}")
if theirs:
    print(f"  {len(theirs)} in AdGuard Home but not in the filter list (left untouched):")
    for r in theirs:
        print(f"    ? {r}")

if mode == "check":
    sys.exit(0)
if not added:
    sys.exit(3)  # nothing to do; caller skips the restart

# Rules begin with "|", which YAML reads as a block-scalar indicator, so every
# entry has to be quoted.
def quoted(rule):
    return "'" + rule.replace("'", "''") + "'"

merged = existing + added
body = [f"{indent}  - {quoted(r)}" for r in merged]
new_lines = lines[:start] + [f"{indent}user_rules:"] + body + lines[end:]
new_text = "\n".join(new_lines)

# Parse before writing, so a bad edit never reaches disk or the service.
try:
    import yaml
except ImportError:
    print("  warning: pyyaml missing, skipping validation")
else:
    doc = yaml.safe_load(new_text)
    found = doc.get("user_rules") if isinstance(doc, dict) else None
    if found is None and isinstance(doc, dict):
        found = (doc.get("filtering") or {}).get("user_rules")
    if found != merged:
        sys.exit(f"validation failed: user_rules round-tripped as {found!r}")

open(conf_path, "w").write(new_text)
PY
}

if (( CHECK )); then
  merge check
  exit 0
fi

BAK="$CONF.bak.$(date +%Y%m%d%H%M%S)"
cp -a "$CONF" "$BAK"

# AdGuard Home rewrites its config on shutdown, so it has to be stopped for the
# edit. DNS is down for a second or two.
systemctl stop adguardhome

set +e
merge write
STATUS=$?
set -e

if (( STATUS == 3 )); then
  systemctl start adguardhome
  rm -f "$BAK"
  echo "nothing to add -- AdGuard Home already has every rule"
  exit 0
elif (( STATUS != 0 )); then
  cp -a "$BAK" "$CONF"
  systemctl start adguardhome
  echo "merge failed -- config restored from $BAK" >&2
  exit 1
fi

systemctl start adguardhome
sleep 1
if systemctl is-active --quiet adguardhome; then
  echo "adguardhome restarted (backup: $BAK)"
else
  echo "adguardhome failed to start -- restoring $BAK" >&2
  cp -a "$BAK" "$CONF"
  systemctl start adguardhome
  exit 1
fi
