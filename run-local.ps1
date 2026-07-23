$ErrorActionPreference = "Stop"

$app = Join-Path $env:TEMP "sotto-target\release\sotto.exe"
if (-not (Test-Path $app)) {
    throw "Local release app not found. Run .\build-local.ps1 first."
}

Start-Process -FilePath $app -WorkingDirectory (Split-Path $app)
