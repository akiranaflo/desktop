# Resizes the app icon into the sizes a home-screen install needs.
# Run from the repo root: powershell -File scripts/make-pwa-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "build/icons/512x512.png"
$out = Join-Path $root "public/icons"
New-Item -ItemType Directory -Force $out | Out-Null

function Resize-Icon([string]$dest, [int]$size, [double]$scale = 1.0) {
  $image = [System.Drawing.Image]::FromFile($src)
  try {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = "HighQuality"
    $g.InterpolationMode = "HighQualityBicubic"
    $g.PixelOffsetMode = "HighQuality"
    $g.Clear([System.Drawing.Color]::FromArgb(255, 0, 0, 0))
    $inner = [int]($size * $scale)
    $offset = [int](($size - $inner) / 2)
    $g.DrawImage($image, $offset, $offset, $inner, $inner)
    $g.Dispose()
    $bmp.Save($dest, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
  } finally {
    $image.Dispose()
  }
}

Resize-Icon (Join-Path $out "icon-180.png") 180
Resize-Icon (Join-Path $out "icon-192.png") 192
Resize-Icon (Join-Path $out "icon-512.png") 512
# maskable icons keep the artwork inside the 80% safe zone
Resize-Icon (Join-Path $out "icon-maskable-512.png") 512 0.8
Get-ChildItem $out | Select-Object Name, Length
