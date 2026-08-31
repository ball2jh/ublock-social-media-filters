#!/usr/bin/env python3
import re
import sys
from pathlib import Path


# These rules predate managed-state tracking. Claim them once so the first run
# can remove the obsolete Twitch DNS block.
LEGACY_MANAGED = {
    "||twitch.tv^",
    "||twitchcdn.net^",
    "||jtvnw.net^",
}


def domain(rule):
    match = re.match(r"^\|\|([\w.-]+)\^", rule)
    return match.group(1) if match else None


def plural(count, singular, plural_form=None):
    return singular if count == 1 else (plural_form or singular + "s")


def main():
    if len(sys.argv) != 5 or sys.argv[4] not in {"check", "write"}:
        sys.exit(f"usage: {sys.argv[0]} CONFIG RULES STATE check|write")

    config_path = Path(sys.argv[1])
    rules_path = Path(sys.argv[2])
    state_path = Path(sys.argv[3])
    mode = sys.argv[4]

    lines = config_path.read_text().split("\n")
    start = next(
        (i for i, line in enumerate(lines) if re.match(r"^(\s*)user_rules:", line)),
        None,
    )
    if start is None:
        sys.exit("no user_rules: key in config")

    indent = re.match(r"^(\s*)", lines[start]).group(1)
    end = start + 1
    while end < len(lines):
        line = lines[end]
        if line.strip() and not re.match(rf"^{indent}\s+", line):
            break
        end += 1

    existing = []
    for line in lines[start + 1 : end]:
        match = re.match(r"^\s*-\s*(.*)$", line)
        if match:
            existing.append(match.group(1).strip().strip("\"'"))

    generated = [line.strip() for line in rules_path.read_text().splitlines() if line.strip()]

    if state_path.exists():
        previously_managed = {
            line.strip() for line in state_path.read_text().splitlines() if line.strip()
        }
    else:
        # Existing exact matches came from earlier runs of this installer. Claim
        # them along with the one-time legacy migration rules.
        previously_managed = LEGACY_MANAGED | (set(existing) & set(generated))

    unmanaged = [rule for rule in existing if rule not in previously_managed]
    covered_domains = {value for value in map(domain, unmanaged) if value}
    managed = [rule for rule in generated if domain(rule) not in covered_domains]
    merged = unmanaged + managed

    removed = [
        rule for rule in existing if rule in previously_managed and rule not in set(merged)
    ]
    added = [rule for rule in managed if rule not in existing]

    print(f"  {len(existing)} rules already in AdGuard Home")
    print(f"  {len(removed)} managed {plural(len(removed), 'rule')} to remove")
    for rule in removed:
        print(f"    - {rule}")
    print(f"  {len(added)} managed {plural(len(added), 'rule')} to add")
    for rule in added:
        print(f"    + {rule}")
    print(f"  {len(unmanaged)} unrelated {plural(len(unmanaged), 'rule')} preserved")

    if mode == "check":
        return

    state_text = "".join(f"{rule}\n" for rule in managed)
    config_changed = merged != existing
    state_changed = not state_path.exists() or state_path.read_text() != state_text
    if not config_changed and not state_changed:
        sys.exit(3)

    if config_changed:
        def quoted(rule):
            return "'" + rule.replace("'", "''") + "'"

        body = [f"{indent}  - {quoted(rule)}" for rule in merged]
        new_lines = lines[:start] + [f"{indent}user_rules:"] + body + lines[end:]
        new_text = "\n".join(new_lines)

        try:
            import yaml
        except ImportError:
            print("  warning: pyyaml missing, skipping validation")
        else:
            document = yaml.safe_load(new_text)
            found = document.get("user_rules") if isinstance(document, dict) else None
            if found is None and isinstance(document, dict):
                found = (document.get("filtering") or {}).get("user_rules")
            if found != merged:
                sys.exit(f"validation failed: user_rules round-tripped as {found!r}")

        config_path.write_text(new_text)

    state_path.write_text(state_text)


if __name__ == "__main__":
    main()
