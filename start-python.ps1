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
foreach ($service in @(
    @{ Name = "api"; Port = 8000; Args = @("-m", "uvicorn", "backend.api:app", "--host", "127.0.0.1", "--port", "8000", "--no-access-log") },
    @{ Name = "streamlit"; Port = 8501; Args = @("-m", "streamlit", "run", "streamlit_app.py") }
)) {
    if (Get-NetTCPConnection -LocalPort $service.Port -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "$($service.Name): port $($service.Port) is already in use; leaving that process unchanged."
        continue
    }
    $process = Start-Process -FilePath $pythonPath -ArgumentList $service.Args -WorkingDirectory $projectRoot -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logPath "$($service.Name).stdout.log") -RedirectStandardError (Join-Path $logPath "$($service.Name).stderr.log")
    Write-Host "$($service.Name): started PID $($process.Id) on http://127.0.0.1:$($service.Port)"
}
