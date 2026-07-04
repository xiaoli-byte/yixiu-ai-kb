$ProgressPreference = 'SilentlyContinue'
$imgPath = "$env:TEMP\ocr_gpu_test.png"
$bytes = [System.IO.File]::ReadAllBytes($imgPath)
$boundary = [System.Guid]::NewGuid().ToString()
$LF = "`r`n"
$enc = [System.Text.Encoding]::GetEncoding('iso-8859-1')
$bodyLines = @(
    "--$boundary",
    "Content-Disposition: form-data; name=`"image`"; filename=`"test.png`"",
    "Content-Type: image/png",
    "",
    $enc.GetString($bytes),
    "--$boundary--",
    ""
)
$body = $bodyLines -join $LF
Write-Host "[$(Get-Date -Format HH:mm:ss)] Sending OCR request to GPU PaddleOCR (first request will download models, may take 3-5 min)..."
try {
    $r = Invoke-WebRequest -Uri "http://localhost:10096/ocr" -Method Post -ContentType "multipart/form-data; boundary=$boundary" -Body $body -UseBasicParsing -TimeoutSec 600
    Write-Host "[$(Get-Date -Format HH:mm:ss)] STATUS: $($r.StatusCode)"
    Write-Host "BODY: $($r.Content)"
} catch {
    Write-Host "[$(Get-Date -Format HH:mm:ss)] ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        Write-Host "RESP: $($reader.ReadToEnd())"
    }
}
