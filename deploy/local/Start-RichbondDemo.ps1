[CmdletBinding()]
param(
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$toolsDirectory = Join-Path $projectRoot ".tools"
$secretPath = Join-Path $toolsDirectory "neon-database-url.secret"
$cloudflaredPath = Join-Path $toolsDirectory "cloudflared.exe"
$backendPidPath = Join-Path $toolsDirectory "backend.pid"
$tunnelPidPath = Join-Path $toolsDirectory "tunnel.pid"
$tunnelUrlPath = Join-Path $toolsDirectory "active-tunnel-url.txt"
$backendLog = Join-Path $toolsDirectory "backend.log"
$backendErrorLog = Join-Path $toolsDirectory "backend.err.log"
$tunnelLog = Join-Path $toolsDirectory "tunnel.log"
$tunnelErrorLog = Join-Path $toolsDirectory "tunnel.err.log"

function Stop-TrackedProcess {
  param(
    [string]$PidPath,
    [string[]]$AllowedNames
  )

  if (-not (Test-Path -LiteralPath $PidPath)) {
    return
  }

  $trackedId = 0
  if ([int]::TryParse(([IO.File]::ReadAllText($PidPath)).Trim(), [ref]$trackedId)) {
    $process = Get-Process -Id $trackedId -ErrorAction SilentlyContinue
    if ($process -and $AllowedNames -contains $process.ProcessName) {
      Stop-Process -Id $trackedId -Force
      $process.WaitForExit()
    }
  }

  Remove-Item -LiteralPath $PidPath -Force -ErrorAction SilentlyContinue
}

function Read-CombinedLog {
  param([string[]]$Paths)

  return ($Paths | ForEach-Object {
    if (Test-Path -LiteralPath $_) {
      try {
        $stream = [IO.File]::Open($_, [IO.FileMode]::Open, [IO.FileAccess]::Read, [IO.FileShare]::ReadWrite)
        $reader = New-Object IO.StreamReader($stream)
        try {
          $reader.ReadToEnd()
        } finally {
          $reader.Dispose()
          $stream.Dispose()
        }
      } catch [IO.IOException] {
        ""
      }
    }
  }) -join "`n"
}

function Invoke-PublicHealthCheck {
  param([string]$PublicUrl)

  try {
    return Invoke-RestMethod -Uri "$PublicUrl/api/health" -TimeoutSec 10
  } catch {
    $systemDnsError = $_.Exception.Message
  }

  try {
    $publicUri = [Uri]$PublicUrl
    $dnsName = [Uri]::EscapeDataString($publicUri.DnsSafeHost)
    $dnsResult = Invoke-RestMethod `
      -Uri "https://dns.google/resolve?name=$dnsName&type=A" `
      -Headers @{ Accept = "application/dns-json" } `
      -TimeoutSec 10
    $edgeAddress = $dnsResult.Answer |
      Where-Object { $_.type -eq 1 } |
      Select-Object -First 1 -ExpandProperty data
    if (-not $edgeAddress) {
      throw "Public DNS did not return an IPv4 address."
    }

    $resolveTarget = "{0}:443:{1}" -f $publicUri.DnsSafeHost, $edgeAddress
    $response = & curl.exe `
      --silent `
      --show-error `
      --fail `
      --max-time 15 `
      --resolve $resolveTarget `
      "$PublicUrl/api/health" 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "The direct Cloudflare edge check failed."
    }
    return $response | ConvertFrom-Json
  } catch {
    throw "System DNS: $systemDnsError Public DNS fallback: $($_.Exception.Message)"
  }
}

if (-not (Test-Path -LiteralPath $secretPath)) {
  throw "Database secret not found. Run deploy/local/Set-RichbondDatabaseSecret.ps1 first."
}

if (-not (Test-Path -LiteralPath $cloudflaredPath)) {
  throw "cloudflared.exe was not found in .tools."
}

New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null
Set-Location $projectRoot

if (-not $SkipBuild) {
  & npm.cmd run build
  if ($LASTEXITCODE -ne 0) {
    throw "The frontend build failed."
  }
}

Stop-TrackedProcess -PidPath $tunnelPidPath -AllowedNames @("cloudflared")
Stop-TrackedProcess -PidPath $backendPidPath -AllowedNames @("node")
Remove-Item -LiteralPath $tunnelUrlPath -Force -ErrorAction SilentlyContinue

foreach ($logPath in @($backendLog, $backendErrorLog, $tunnelLog, $tunnelErrorLog)) {
  Remove-Item -LiteralPath $logPath -Force -ErrorAction SilentlyContinue
}

$encryptedValue = [IO.File]::ReadAllText($secretPath).Trim()
$secureValue = ConvertTo-SecureString $encryptedValue
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)

try {
  $databaseUrl = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
  if ($databaseUrl -notmatch "^postgres(?:ql)?://") {
    throw "The encrypted database value is invalid."
  }

  $env:NODE_ENV = "production"
  $env:HOST = "0.0.0.0"
  $env:PORT = "3000"
  $env:DATABASE_URL = $databaseUrl
  $env:DATABASE_SSL_MODE = "verify-full"
  $env:DATABASE_AUTO_SEED = "false"
  $env:DATABASE_POOL_MAX = "5"

  $nodePath = (Get-Command node.exe).Source
  $backend = Start-Process `
    -FilePath $nodePath `
    -ArgumentList @("backend/server.mjs") `
    -WorkingDirectory $projectRoot `
    -RedirectStandardOutput $backendLog `
    -RedirectStandardError $backendErrorLog `
    -WindowStyle Hidden `
    -PassThru
} finally {
  Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
  $databaseUrl = $null
  if ($pointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

[IO.File]::WriteAllText($backendPidPath, [string]$backend.Id)

$localHealth = $null
for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
  if ($backend.HasExited) {
    $details = Read-CombinedLog @($backendLog, $backendErrorLog)
    throw "The backend stopped during startup.`n$details"
  }

  try {
    $localHealth = Invoke-RestMethod -Uri "http://127.0.0.1:3000/api/health" -TimeoutSec 5
    if ($localHealth.ok -and $localHealth.database -eq "postgresql") {
      break
    }
  } catch {
    Start-Sleep -Seconds 1
  }
}

if (-not $localHealth -or -not $localHealth.ok -or $localHealth.database -ne "postgresql") {
  Stop-TrackedProcess -PidPath $backendPidPath -AllowedNames @("node")
  $details = Read-CombinedLog @($backendLog, $backendErrorLog)
  throw "The Neon-backed health check did not become ready.`n$details"
}

$tunnel = Start-Process `
  -FilePath $cloudflaredPath `
  -ArgumentList @("tunnel", "--no-autoupdate", "--url", "http://127.0.0.1:3000") `
  -WorkingDirectory $projectRoot `
  -RedirectStandardOutput $tunnelLog `
  -RedirectStandardError $tunnelErrorLog `
  -WindowStyle Hidden `
  -PassThru

[IO.File]::WriteAllText($tunnelPidPath, [string]$tunnel.Id)

$publicUrl = $null
for ($attempt = 0; $attempt -lt 90; $attempt += 1) {
  if ($tunnel.HasExited) {
    $details = Read-CombinedLog @($tunnelLog, $tunnelErrorLog)
    Stop-TrackedProcess -PidPath $backendPidPath -AllowedNames @("node")
    throw "Cloudflare Tunnel stopped during startup.`n$details"
  }

  $tunnelOutput = Read-CombinedLog @($tunnelLog, $tunnelErrorLog)
  $urlMatch = [regex]::Match($tunnelOutput, "https://[a-z0-9-]+\.trycloudflare\.com")
  if ($urlMatch.Success) {
    $publicUrl = $urlMatch.Value
    break
  }
  Start-Sleep -Seconds 1
}

if (-not $publicUrl) {
  Stop-TrackedProcess -PidPath $tunnelPidPath -AllowedNames @("cloudflared")
  Stop-TrackedProcess -PidPath $backendPidPath -AllowedNames @("node")
  throw "Cloudflare did not provide a public URL."
}

$publicHealth = $null
$publicHealthError = "No response received."
for ($attempt = 0; $attempt -lt 180; $attempt += 1) {
  try {
    $publicHealth = Invoke-PublicHealthCheck -PublicUrl $publicUrl
    if ($publicHealth.ok -and $publicHealth.database -eq "postgresql") {
      break
    }
  } catch {
    $publicHealthError = $_.Exception.Message
    Start-Sleep -Seconds 1
  }
}

if (-not $publicHealth -or -not $publicHealth.ok -or $publicHealth.database -ne "postgresql") {
  Stop-TrackedProcess -PidPath $tunnelPidPath -AllowedNames @("cloudflared")
  Stop-TrackedProcess -PidPath $backendPidPath -AllowedNames @("node")
  throw "The public health check failed. Last error: $publicHealthError"
}

[IO.File]::WriteAllText($tunnelUrlPath, $publicUrl)
Write-Host "Richbond demo is online:" -ForegroundColor Green
Write-Host $publicUrl -ForegroundColor Cyan
Write-Host "Keep this laptop powered on. Run Stop-RichbondDemo.ps1 to stop access." -ForegroundColor DarkGray
