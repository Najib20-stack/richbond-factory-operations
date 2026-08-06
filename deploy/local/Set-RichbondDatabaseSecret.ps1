[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$toolsDirectory = Join-Path $projectRoot ".tools"
$secretPath = Join-Path $toolsDirectory "neon-database-url.secret"

New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null

Write-Host "Copy the pooled PostgreSQL connection string from Neon." -ForegroundColor Cyan
Write-Host "Paste it below and press Enter. The value will not be displayed." -ForegroundColor DarkGray
$secureValue = Read-Host "Neon DATABASE_URL" -AsSecureString

$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
try {
  $plainValue = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($plainValue -notmatch "^postgres(?:ql)?://") {
    throw "The value is not a PostgreSQL connection string."
  }
} finally {
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
  $plainValue = $null
}

$encryptedValue = ConvertFrom-SecureString $secureValue
$utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
[IO.File]::WriteAllText($secretPath, $encryptedValue, $utf8WithoutBom)

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
$account = New-Object Security.Principal.NTAccount($identity)
$acl = New-Object Security.AccessControl.FileSecurity
$acl.SetOwner($account)
$acl.SetAccessRuleProtection($true, $false)
$rule = New-Object Security.AccessControl.FileSystemAccessRule($identity, "FullControl", "Allow")
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $secretPath -AclObject $acl

Write-Host "Neon connection saved with Windows user encryption." -ForegroundColor Green
Write-Host $secretPath -ForegroundColor DarkGray
