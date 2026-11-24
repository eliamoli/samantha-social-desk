#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
mkdir -p dist
python3 - <<'PY'
import pathlib, zipfile
files={'manifest.json':'chat-pilot/manifest.json','INSTALL.md':'chat-pilot/INSTALL.md'}
for p in ('draft/core.mjs','chat-pilot/server/index.mjs','chat-pilot/server/mock.mjs'):
 files[p]=p
for p in pathlib.Path('chat-pilot/server/fixtures').glob('SJ-W03-R1*'):
 files[str(p)]=str(p)
with zipfile.ZipFile('dist/samantha-social-desk-0.4.0.mcpb','x',zipfile.ZIP_DEFLATED) as z:
 for name,p in sorted(files.items()):
  m=zipfile.ZipInfo(name,date_time=(2026,11,24,0,0,0));m.compress_type=zipfile.ZIP_DEFLATED;z.writestr(m,pathlib.Path(p).read_bytes())
PY
unzip -tq dist/samantha-social-desk-0.4.0.mcpb
