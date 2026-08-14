param([switch]$UiOnly)

$ErrorActionPreference = "Stop"
Set-Location $PSScriptRoot

# Load MSVC build tools
$vcvarsall = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
$envOutput = cmd /c "`"$vcvarsall`" x64 > nul 2>&1 && set"
foreach ($line in $envOutput) {
    if ($line -match "^([^=]+)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
    }
}
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"
$env:CARGO_TARGET_DIR = Join-Path $env:TEMP "verba-target"

# Stop only this checkout's stale debug app/sidecar before starting one session.
$debugRoots = @(
    (Join-Path $env:CARGO_TARGET_DIR "debug"),
    (Join-Path $PSScriptRoot "src-tauri\target\debug")
)
foreach ($debugRoot in $debugRoots) {
    foreach ($name in @("verba", "sidecar")) {
        $path = Join-Path $debugRoot "$name.exe"
        Get-Process -Name $name -ErrorAction SilentlyContinue |
            Where-Object { $_.Path -eq $path } |
            Stop-Process -Force -ErrorAction SilentlyContinue
    }
}

# Kill only the process currently holding Vite's fixed dev port.
$conn = Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue
if ($conn) {
    $conn | Select-Object -ExpandProperty OwningProcess -Unique |
        Stop-Process -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

if ($UiOnly) {
    & pnpm run dev:ui
} else {
    & pnpm run dev:app
}
