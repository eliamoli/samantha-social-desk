$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
if ((Get-Content -Raw chat-pilot/manifest.json | ConvertFrom-Json).version -ne '0.5.0') {throw 'Use the 0.5 branch to rebuild 0.5; this guard preserves its artifact'}
Add-Type -AssemblyName System.IO.Compression
$files = [ordered]@{
 'manifest.json'='chat-pilot/manifest.json'
 'INSTALL.md'='chat-pilot/INSTALL.md'
 'TRANSFER.md'='TRANSFER.md'
 'draft/core.mjs'='draft/core.mjs'
 'chat-pilot/server/index.mjs'='chat-pilot/server/index.mjs'
 'chat-pilot/server/mock.mjs'='chat-pilot/server/mock.mjs'
}
Get-ChildItem -LiteralPath 'chat-pilot/server/fixtures' -File | ForEach-Object {
 $name='chat-pilot/server/fixtures/'+$_.Name
 $files[$name]=$name
}
Get-ChildItem -LiteralPath 'transfer' -Filter '*.mjs' -File | ForEach-Object {
 $name='transfer/'+$_.Name
 $files[$name]=$name
}
New-Item -ItemType Directory -Force -Path 'dist' | Out-Null
$artifact=Join-Path (Get-Location) 'dist/samantha-social-desk-0.5.0.mcpb'
$stream=[IO.File]::Open($artifact,[IO.FileMode]::Create)
$zip=[IO.Compression.ZipArchive]::new($stream,[IO.Compression.ZipArchiveMode]::Create)
try {
 foreach($name in ($files.Keys | Sort-Object)) {
  $entry=$zip.CreateEntry($name,[IO.Compression.CompressionLevel]::Optimal)
  $entry.LastWriteTime=[DateTimeOffset]::new(2026,11,25,0,0,0,[TimeSpan]::Zero)
  $out=$entry.Open()
  try { $bytes=[IO.File]::ReadAllBytes((Join-Path (Get-Location) $files[$name])); $out.Write($bytes,0,$bytes.Length) } finally { $out.Dispose() }
 }
} finally { $zip.Dispose(); $stream.Dispose() }
$hash=(Get-FileHash -Algorithm SHA256 -LiteralPath $artifact).Hash.ToLowerInvariant()
[IO.File]::WriteAllText($artifact+'.sha256',$hash+'  '+[IO.Path]::GetFileName($artifact)+[Environment]::NewLine)
Write-Output ('Built '+$artifact)
Write-Output ('SHA-256 '+$hash)
