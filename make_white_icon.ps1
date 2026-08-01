Add-Type -AssemblyName System.Drawing
$img = [System.Drawing.Image]::FromFile("public/test_white_logo.png")
$size = 512
$bmp = New-Object System.Drawing.Bitmap($size, $size)
$graphics = [System.Drawing.Graphics]::FromImage($bmp)
$graphics.Clear([System.Drawing.Color]::Transparent)

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
$bmp.Save("public/vbills-icon-white-512.png", [System.Drawing.Imaging.ImageFormat]::Png)

$size192 = 192
$bmp192 = New-Object System.Drawing.Bitmap($size192, $size192)
$g192 = [System.Drawing.Graphics]::FromImage($bmp192)
$g192.Clear([System.Drawing.Color]::Transparent)
$g192.DrawImage($bmp, 0, 0, $size192, $size192)
$bmp192.Save("public/vbills-icon-white-192.png", [System.Drawing.Imaging.ImageFormat]::Png)

$graphics.Dispose()
$g192.Dispose()
$bmp.Dispose()
$bmp192.Dispose()
$img.Dispose()
