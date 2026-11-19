# Generates Android launcher icons from the shared PWA icon.
# Run from mobile/: powershell -File make-android-icons.ps1
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$src = Join-Path $root "public/icons/icon-512.png"
$res = Join-Path $PSScriptRoot "android/app/src/main/res"

function Save-Icon([string]$dest, [int]$size, [double]$scale) {
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

$densities = @{
  "mdpi"    = 48
  "hdpi"    = 72
  "xhdpi"   = 96
  "xxhdpi"  = 144
  "xxxhdpi" = 192
}

foreach ($entry in $densities.GetEnumerator()) {
  $dir = Join-Path $res ("mipmap-" + $entry.Key)
  New-Item -ItemType Directory -Force $dir | Out-Null
  Save-Icon (Join-Path $dir "ic_launcher.png") $entry.Value 1.0
  Save-Icon (Join-Path $dir "ic_launcher_round.png") $entry.Value 1.0
  $foreground = [int]($entry.Value * 2.25)
  Save-Icon (Join-Path $dir "ic_launcher_foreground.png") $foreground 0.72
}

Get-ChildItem (Join-Path $res "mipmap-xxxhdpi") | Select-Object Name, Length
