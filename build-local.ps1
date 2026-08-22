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

$venvPython = Join-Path $PSScriptRoot "sidecar\.venv\Scripts\python.exe"
$pyinstaller = Join-Path $PSScriptRoot "sidecar\.venv\Scripts\pyinstaller.exe"
if (-not (Test-Path $venvPython)) {
    throw "sidecar\.venv is missing. From sidecar\: python -m venv .venv ; .\.venv\Scripts\pip install -r requirements.txt pyinstaller"
}

Write-Host "Installing pinned sidecar deps (onnx-asr 0.11.0)..."
& $venvPython -m pip install -r (Join-Path $PSScriptRoot "sidecar\requirements.txt")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
if (-not (Test-Path $pyinstaller)) {
    & $venvPython -m pip install pyinstaller
    if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
}

$binDir = Join-Path $PSScriptRoot "src-tauri\binaries"
New-Item -ItemType Directory -Force -Path $binDir | Out-Null
$sidecarWork = Join-Path $env:TEMP "verba-sidecar-build"
$sidecarDist = Join-Path $env:TEMP "verba-sidecar-dist"

Write-Host "Rebuilding the Parakeet sidecar..."
& $pyinstaller --clean --noconfirm --distpath $sidecarDist --workpath $sidecarWork (Join-Path $PSScriptRoot "sidecar.spec")
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
Copy-Item (Join-Path $sidecarDist "sidecar.exe") (Join-Path $binDir "sidecar-x86_64-pc-windows-msvc.exe") -Force

# Local installers must not require TAURI_SIGNING_PRIVATE_KEY. GitHub releases
# still sign because release.yml leaves createUpdaterArtifacts true in tauri.conf.json.
$localTauriConfig = Join-Path $env:TEMP "verba-local-tauri.json"
Set-Content -Path $localTauriConfig -Value '{"bundle":{"createUpdaterArtifacts":false}}' -Encoding ascii

Write-Host "Building the local Verba installer (unsigned)..."
# NSIS is the self-contained Windows installer and does not require WiX's MSI linker.
& pnpm run build:app -- --bundles nsis --config $localTauriConfig
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host ""
Write-Host "Installers:" -ForegroundColor Green
Get-ChildItem (Join-Path $env:CARGO_TARGET_DIR "release\bundle") -Recurse -File |
    Where-Object { $_.Extension -in @(".msi", ".exe", ".dmg", ".app") } |
    Select-Object -ExpandProperty FullName
