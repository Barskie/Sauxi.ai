param(
  [string]$Version = "0.1.0"
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$distDir = Join-Path $repoRoot "dist"
$archivePath = Join-Path $distDir "Sauxi.ai-v$Version.zip"

New-Item -ItemType Directory -Path $distDir -Force | Out-Null
if (Test-Path -LiteralPath $archivePath) {
  Remove-Item -LiteralPath $archivePath -Force
}

git -C $repoRoot archive --format=zip --prefix="Sauxi.ai/" --output=$archivePath HEAD
if ($LASTEXITCODE -ne 0) {
  throw "git archive failed with exit code $LASTEXITCODE"
}

$hash = ((certutil -hashfile $archivePath SHA256 | Select-Object -Skip 1 | Select-Object -First 1) -replace '\s','').ToLowerInvariant()
$size = (Get-Item -LiteralPath $archivePath).Length
Write-Host "Created $archivePath"
Write-Host "Bytes: $size"
Write-Host "SHA256: $hash"

