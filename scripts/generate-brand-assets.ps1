param(
    [string]$SourcePath = "frontend/assets/richbond-logo-white.png"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$sourceFile = [System.IO.Path]::GetFullPath((Join-Path $root $SourcePath))
$resourceRoot = Join-Path $root "android/app/src/main/res"

if (-not (Test-Path -LiteralPath $sourceFile)) {
    throw "Logo source not found: $sourceFile"
}

function Get-ImageSize([string]$Path) {
    $image = [System.Drawing.Image]::FromFile($Path)
    try {
        return [pscustomobject]@{ Width = $image.Width; Height = $image.Height }
    }
    finally {
        $image.Dispose()
    }
}

function Save-WhiteCanvas([string]$Path) {
    $size = Get-ImageSize $Path
    $bitmap = New-Object System.Drawing.Bitmap($size.Width, $size.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Save-CenteredLogo(
    [string]$Path,
    [System.Drawing.Image]$Source,
    [double]$MaxWidthRatio,
    [double]$MaxHeightRatio
) {
    $size = Get-ImageSize $Path
    $scale = [Math]::Min(
        ($size.Width * $MaxWidthRatio) / $Source.Width,
        ($size.Height * $MaxHeightRatio) / $Source.Height
    )
    $width = [Math]::Max(1, [int][Math]::Round($Source.Width * $scale))
    $height = [Math]::Max(1, [int][Math]::Round($Source.Height * $scale))
    $x = [int][Math]::Round(($size.Width - $width) / 2)
    $y = [int][Math]::Round(($size.Height - $height) / 2)

    $bitmap = New-Object System.Drawing.Bitmap($size.Width, $size.Height, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    try {
        $graphics.Clear([System.Drawing.Color]::White)
        $graphics.CompositingMode = [System.Drawing.Drawing2D.CompositingMode]::SourceOver
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($Source, $x, $y, $width, $height)
        $bitmap.Save($Path, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

$source = [System.Drawing.Image]::FromFile($sourceFile)
try {
    Get-ChildItem -LiteralPath $resourceRoot -Recurse -File -Filter "splash.png" |
        ForEach-Object { Save-CenteredLogo $_.FullName $source 0.82 0.58 }

    Get-ChildItem -LiteralPath $resourceRoot -Recurse -File |
        Where-Object { $_.Name -in @("ic_launcher.png", "ic_launcher_round.png") } |
        ForEach-Object { Save-CenteredLogo $_.FullName $source 0.90 0.52 }

    Get-ChildItem -LiteralPath $resourceRoot -Recurse -File -Filter "ic_launcher_foreground.png" |
        ForEach-Object { Save-CenteredLogo $_.FullName $source 0.96 0.52 }

    Get-ChildItem -LiteralPath $resourceRoot -Recurse -File -Filter "ic_launcher_background.png" |
        ForEach-Object { Save-WhiteCanvas $_.FullName }
}
finally {
    $source.Dispose()
}

Write-Output "White-background web and Android brand assets generated from $sourceFile"
