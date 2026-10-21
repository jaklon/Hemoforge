param([switch]$Install)
$ErrorActionPreference = "Stop"
$projectRoot = $PSScriptRoot
$pythonPath = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path -LiteralPath $pythonPath)) {
    & python -m venv (Join-Path $projectRoot ".venv")
    if ($LASTEXITCODE -ne 0) { throw "Could not create the Python environment." }
    $Install = $true
}
if ($Install) {
    & $pythonPath -m pip install -r (Join-Path $projectRoot "requirements.txt")
    if ($LASTEXITCODE -ne 0) { throw "Python dependency installation failed." }
}
$logPath = Join-Path $projectRoot "logs"
New-Item -ItemType Directory -Force -Path $logPath | Out-Null
if (Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue) {
    Write-Host "Port 8000 is already in use; leaving that process unchanged."
    return
}
$process = Start-Process -FilePath $pythonPath -ArgumentList @("-m", "uvicorn", "backend.api:app", "--host", "127.0.0.1", "--port", "8000", "--no-access-log") -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath "api.stdout.log") -RedirectStandardError (Join-Path $logPath "api.stderr.log")
Write-Host "Python API: started PID $($process.Id). Use the website at http://localhost:8443."
