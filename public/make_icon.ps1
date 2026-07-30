Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("logo.png")
$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.Clear([System.Drawing.Color]::White)

# Make the logo take up 80% of the square for nice padding
$paddingScale = 0.8
$drawWidth = $size * $paddingScale
$drawHeight = $size * $paddingScale

$ratio = $img.Width / $img.Height
$newWidth = $drawWidth
$newHeight = $drawHeight
if ($ratio -gt 1) {
    $newHeight = $drawWidth / $ratio
} else {
    $newWidth = $drawHeight * $ratio
}
$x = ($size - $newWidth) / 2
$y = ($size - $newHeight) / 2

$graphics.DrawImage($img, $x, $y, $newWidth, $newHeight)
$bmp.Save("vbills-icon-192.png", [System.Drawing.Imaging.ImageFormat]::Png)
$bmp.Save("vbills-icon-512.png", [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$bmp.Dispose()
$img.Dispose()
