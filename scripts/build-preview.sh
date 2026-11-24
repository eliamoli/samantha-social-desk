#!/bin/sh
set -eu
cd "$(dirname "$0")/../preview"
mkdir -p ../dist
test ! -e ../dist/samantha-social-desk-preview-0.2.0.mcpb
zip -q -X ../dist/samantha-social-desk-preview-0.2.0.mcpb manifest.json server/index.cjs server/dummy-cover.png README.md
unzip -t ../dist/samantha-social-desk-preview-0.2.0.mcpb
