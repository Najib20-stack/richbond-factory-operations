[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$projectRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$toolsDirectory = Join-Path $projectRoot ".tools"
$cloudflaredPath = Join-Path $toolsDirectory "cloudflared.exe"
$downloadPath = Join-Path $toolsDirectory "cloudflared.exe.download"
$downloadUrl = "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"

New-Item -ItemType Directory -Force -Path $toolsDirectory | Out-Null

if (Test-Path -LiteralPath $cloudflaredPath) {
  $existingSignature = Get-AuthenticodeSignature -LiteralPath $cloudflaredPath
  if ($existingSignature.Status -eq "Valid" -and $existingSignature.SignerCertificate.Subject -match "Cloudflare, Inc\.") {
    & $cloudflaredPath --version
    Write-Host "The verified Cloudflare Tunnel binary is already installed." -ForegroundColor Green
    exit 0
  }
}

Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
Write-Host "Downloading Cloudflare Tunnel..." -ForegroundColor Cyan
Invoke-WebRequest -Uri $downloadUrl -OutFile $downloadPath

$signature = Get-AuthenticodeSignature -LiteralPath $downloadPath
if ($signature.Status -ne "Valid" -or $signature.SignerCertificate.Subject -notmatch "Cloudflare, Inc\.") {
  Remove-Item -LiteralPath $downloadPath -Force -ErrorAction SilentlyContinue
  throw "The downloaded cloudflared binary does not have a valid Cloudflare signature."
}

Move-Item -LiteralPath $downloadPath -Destination $cloudflaredPath -Force
& $cloudflaredPath --version
$hash = (Get-FileHash -LiteralPath $cloudflaredPath -Algorithm SHA256).Hash

Write-Host "Cloudflare Tunnel installed and signature verified." -ForegroundColor Green
Write-Host "SHA256: $hash" -ForegroundColor DarkGray
