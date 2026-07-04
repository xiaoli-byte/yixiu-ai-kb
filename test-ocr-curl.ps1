$ProgressPreference = 'SilentlyContinue'
$imgPath = "$env:TEMP\ocr_gpu_test.png"
if (-not (Test-Path $imgPath)) {
    Add-Type -AssemblyName System.Drawing
    $bmp = New-Object System.Drawing.Bitmap 600,200
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.Clear([System.Drawing.Color]::White)
    $font = New-Object System.Drawing.Font("Arial", 36)
    $brush = [System.Drawing.Brushes]::Black
    $g.DrawString("Hello GPU OCR 2026", $font, $brush, 20, 60)
    $bmp.Save($imgPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Created test image: $imgPath"
}

Write-Host "[$(Get-Date -Format HH:mm:ss)] Calling curl.exe..."
$env:PATH = "C:\Windows\System32;$env:PATH"
$output = & curl.exe -s -w "`nHTTP_STATUS:%{http_code}`nTOTAL_TIME:%{time_total}s" -X POST -F "image=@$imgPath" http://localhost:10096/ocr 2>&1
Write-Host "[$(Get-Date -Format HH:mm:ss)] Done"
Write-Host "OUTPUT: $output"
