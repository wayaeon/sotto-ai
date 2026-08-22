$ErrorActionPreference = "Stop"

$app = Join-Path $env:TEMP "verba-target\release\verba.exe"
if (-not (Test-Path $app)) {
    throw "Local release app not found. Run .\build-local.ps1 first."
}

Start-Process -FilePath $app -WorkingDirectory (Split-Path $app)
