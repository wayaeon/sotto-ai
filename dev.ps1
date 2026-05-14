# Load MSVC build tools
$vcvarsall = "C:\Program Files (x86)\Microsoft Visual Studio\2022\BuildTools\VC\Auxiliary\Build\vcvarsall.bat"
$envOutput = cmd /c "`"$vcvarsall`" x64 > nul 2>&1 && set"
foreach ($line in $envOutput) {
    if ($line -match "^([^=]+)=(.*)$") {
        [System.Environment]::SetEnvironmentVariable($Matches[1], $Matches[2], "Process")
    }
}
$env:PATH = "$env:USERPROFILE\.cargo\bin;$env:PATH"

# Kill anything on port 1420
$conn = Get-NetTCPConnection -LocalPort 1420 -ErrorAction SilentlyContinue
if ($conn) {
    $procId = ($conn | Select-Object -First 1).OwningProcess
    Stop-Process -Id $procId -Force -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 1
}

pnpm tauri dev
