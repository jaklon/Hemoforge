param([switch]$ConfirmFreeTrial)
$ErrorActionPreference = "Stop"
if (-not $ConfirmFreeTrial) {
    throw "Verify free trial access to Evo 2 in your NVIDIA account first, then run with -ConfirmFreeTrial. Do not select paid partner endpoints."
}
$evoSecretDirectory = Join-Path $PSScriptRoot "deploy/secrets"
$evoDataDirectory = Join-Path $PSScriptRoot "data"
New-Item -ItemType Directory -Force -Path $evoSecretDirectory, $evoDataDirectory | Out-Null
$evoKeyPath = Join-Path $evoSecretDirectory "nvidia_api_key.txt"
$evoIdentity = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$evoAcl = [System.Security.AccessControl.FileSecurity]::new()
$evoAcl.SetAccessRuleProtection($true, $false)
$evoAcl.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($evoIdentity, "FullControl", "Allow"))
# Apply restricted ACL before storing any credential. No key appears in command history.
if (-not (Test-Path -LiteralPath $evoKeyPath)) { New-Item -ItemType File -Path $evoKeyPath | Out-Null }
Set-Acl -LiteralPath $evoKeyPath -AclObject $evoAcl
$evoSecureKey = Read-Host "NVIDIA API key (hidden; never paste into chat or the website)" -AsSecureString
$evoPointer = [IntPtr]::Zero
try {
    $evoPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($evoSecureKey)
    $evoPlainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($evoPointer)
    if ($evoPlainKey -notmatch '^nvapi-[A-Za-z0-9_-]{16,2048}$') { throw "Unexpected NVIDIA key format; nothing was saved." }
    [IO.File]::WriteAllText($evoKeyPath, $evoPlainKey, [Text.UTF8Encoding]::new($false))
} finally {
    if ($evoPointer -ne [IntPtr]::Zero) { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($evoPointer) }
    $evoPlainKey = $null
    $evoSecureKey.Dispose()
}
$evoConfig = @{ enabled = $true; free_api_confirmed = $true; key_file = "deploy/secrets/nvidia_api_key.txt"; daily_request_limit = 20; logits_layer = "output_layer" }
$evoConfig | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $evoDataDirectory "evo2-nvidia.local.json") -Encoding utf8
Write-Host "NVIDIA trial configured. The key is restricted to your Windows account and excluded from Git/Docker images."
Write-Host "Open http://127.0.0.1:8443/#evo2 and refresh NVIDIA status. No API request has been sent."
