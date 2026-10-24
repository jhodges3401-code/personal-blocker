# Personal Blocker updater (Windows). GPLv3-or-later. No admin rights; only writes inside this folder and %TEMP%.
# Downloads the latest version from GitHub and copies it over the folder this script is in (the one Chrome loads `src` from).
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$Repo      = 'jhodges3401-code/personal-blocker'
$ZipUrl    = "https://github.com/$Repo/archive/refs/heads/main.zip"
$LatestUrl = "https://raw.githubusercontent.com/$Repo/main/latest.json"
if ($env:PB_LATEST_URL) { $LatestUrl = $env:PB_LATEST_URL }  # for testing only

$here = $PSScriptRoot
$manifest = Join-Path $here 'src/manifest.json'
Write-Host "Personal Blocker folder: $here"
if (-not (Test-Path -LiteralPath $manifest)) {
  Write-Host "ERROR: $manifest not found. Put this script in the folder that contains 'src' (the folder Chrome loads)." -ForegroundColor Red
  exit 1
}
$old = (Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json).version
Write-Host "Installed version:       $old"

try { $latest = (Invoke-WebRequest -UseBasicParsing -Uri $LatestUrl -Headers @{ 'Cache-Control' = 'no-cache' }).Content | ConvertFrom-Json
      Write-Host "Latest version online:   $($latest.version)"
      if ($latest.url) { $ZipUrl = $latest.url } }
catch { Write-Host "Could not read latest.json ($($_.Exception.Message)); downloading anyway." }

$tmp = Join-Path $env:TEMP ('pb-update-' + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
  $zip = Join-Path $tmp 'personal-blocker.zip'
  Write-Host "Downloading $ZipUrl ..."
  Invoke-WebRequest -UseBasicParsing -Uri $ZipUrl -OutFile $zip
  Expand-Archive -LiteralPath $zip -DestinationPath (Join-Path $tmp 'x') -Force
  # The new files are in whichever folder holds src\manifest.json (works for a release zip or a GitHub branch zip).
  $m = Get-ChildItem -Path (Join-Path $tmp 'x') -Recurse -Filter manifest.json | Where-Object { $_.Directory.Name -eq 'src' } | Select-Object -First 1
  if (-not $m) { throw 'Downloaded zip has no src\manifest.json' }
  $root = $m.Directory.Parent.FullName
  $new = (Get-Content -LiteralPath $m.FullName -Raw | ConvertFrom-Json).version
  # robocopy: built into Windows, merges folders, overwrites changed files. Exit codes 0-7 mean success.
  robocopy $root $here /E /R:2 /W:1 /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Copy failed (robocopy exit $LASTEXITCODE)" }
  Remove-Item -LiteralPath (Join-Path $here 'src/_metadata') -Recurse -Force -ErrorAction SilentlyContinue
  $now = (Get-Content -LiteralPath $manifest -Raw | ConvertFrom-Json).version
  if ($now -ne $new) { throw "Version check failed: folder has $now, expected $new" }
  Write-Host ""
  Write-Host "Updated: $old -> $now" -ForegroundColor Green
  if ($old -eq $now) { Write-Host "(You already had the latest version.)" }
  else { Write-Host "Chrome switches to v$now by itself within about a minute, or right away when you click the extension icon." }
}
catch { Write-Host "UPDATE FAILED: $($_.Exception.Message)" -ForegroundColor Red; exit 1 }
finally { Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue }
