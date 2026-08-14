$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

$vcvarsall = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
if (Test-Path $vcvarsall) {
    $envOutput = cmd /c "`"$vcvarsall`" x64 > nul 2>&1 && set"
    foreach ($line in $envOutput) {
        if ($line -match "^([^=]+)=(.*)$") {
            [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
        }
    }
}
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP "verba-target"

# Local builds skip updater signing (unsigned). GitHub release workflow signs.
# Without this, tauri fails if TAURI_SIGNING_PRIVATE_KEY is unset.
$env:TAURI_SIGNING_PRIVATE_KEY = ""

Write-Host "Building the local Verba installer (unsigned)..."
# NSIS is the self-contained Windows installer and does not require WiX's MSI linker.
& pnpm run build:app -- --bundles nsis
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Installers:" -ForegroundColor Green
Get-ChildItem (Join-Path $env:CARGO_TARGET_DIR "release\bundle") -Recurse -File |
    Where-Object { $_.Extension -in @(".msi", ".exe", ".dmg", ".app") } |
    Select-Object -ExpandProperty FullName
