#!/usr/bin/env bash
# Regenerate every derived file from ublock-social-media-filters.txt.
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.."
node validate-filters.js >/dev/null
node deploy/gen-usercontent.js
node deploy/gen-policy.js
node deploy/gen-adguard.js
