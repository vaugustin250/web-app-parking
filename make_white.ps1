Add-Type -AssemblyName System.Drawing
$bmp = [System.Drawing.Image]::FromFile('public/logo.png')
$out = New-Object System.Drawing.Bitmap($bmp.Width, $bmp.Height)
$g = [System.Drawing.Graphics]::FromImage($out)
$g.DrawImage($bmp, 0, 0)
$g.Dispose()

for ($x = 0; $x -lt $out.Width; $x++) {
    for ($y = 0; $y -lt $out.Height; $y++) {
        $p = $out.GetPixel($x, $y)
        if ($p.A -gt 50 -and $p.R -lt 50 -and $p.G -lt 50 -and $p.B -lt 50) {
            $out.SetPixel($x, $y, [System.Drawing.Color]::FromArgb($p.A, 255, 255, 255))
        }
    }
}
$out.Save('public/test_white_logo.png', [System.Drawing.Imaging.ImageFormat]::Png)
$out.Dispose()
$bmp.Dispose()
