#!/usr/bin/env bash
# Build the Chrome Web Store upload: dist/listen-loop-<version>.zip
# Contains only what the extension needs at runtime (no tests, store assets or docs).
set -euo pipefail
cd "$(dirname "$0")/.."
version=$(python3 -c 'import json; print(json.load(open("manifest.json"))["version"])')
out="dist/listen-loop-${version}.zip"
mkdir -p dist
rm -f "$out"
# every file the manifest and notebook.html reference must be in this list
zip -q -X -r "$out" manifest.json notebook.html _locales icons src -x '*.DS_Store'
echo "$out"
unzip -l "$out" | tail -n +4 | sed '$d' | sed '$d' | awk '{print "  " $4}'
