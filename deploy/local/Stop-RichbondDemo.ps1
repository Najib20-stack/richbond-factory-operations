[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$toolsDirectory = Join-Path $projectRoot ".tools"

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

Stop-TrackedProcess -PidPath (Join-Path $toolsDirectory "tunnel.pid") -AllowedNames @("cloudflared")
Stop-TrackedProcess -PidPath (Join-Path $toolsDirectory "backend.pid") -AllowedNames @("node")
Remove-Item -LiteralPath (Join-Path $toolsDirectory "active-tunnel-url.txt") -Force -ErrorAction SilentlyContinue

Write-Host "Richbond demo stopped." -ForegroundColor Green
