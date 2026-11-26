$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
Add-Type -AssemblyName System.IO.Compression.FileSystem
$artifact=Join-Path (Get-Location) 'dist/samantha-social-desk-0.5.0.mcpb'
$extract=Join-Path (Get-Location) ('dist/bundle-check-'+[Guid]::NewGuid().ToString('N'))
[IO.Compression.ZipFile]::ExtractToDirectory($artifact,$extract)
$zip=[IO.Compression.ZipFile]::OpenRead($artifact)
try {
 foreach($entry in $zip.Entries) {
  if($entry.FullName -match '(^/|\\|\.\.|test/|keychain|draft/zernio|config\.json|receipts|\.env)'){throw 'Unexpected archive entry'}
 }
} finally {$zip.Dispose()}
$manifest=Get-Content -Raw -LiteralPath (Join-Path $extract 'manifest.json') | ConvertFrom-Json
if($manifest.version -ne '0.5.0' -or $manifest.user_config.transfer_enabled.default -ne $false -or $manifest.user_config.transfer_key.sensitive -ne $true){throw 'Unsafe manifest defaults'}
if($manifest.compatibility.platforms[0] -ne 'darwin'){throw 'Wrong target platform'}
$env:SJ_BUNDLE_ENTRY=Join-Path $extract $manifest.server.entry_point
$env:SJ_EXPECTED_VERSION='0.5.0'
try {
 node --test test/transfer-stdio.test.mjs
 if($LASTEXITCODE -ne 0){throw 'Extracted bundle stdio tests failed'}
} finally {Remove-Item Env:SJ_BUNDLE_ENTRY,Env:SJ_EXPECTED_VERSION -ErrorAction SilentlyContinue}
Write-Output ('PASS: extracted archive/config/entry point; six stdio acceptance cases. Extracted evidence retained at '+$extract)
