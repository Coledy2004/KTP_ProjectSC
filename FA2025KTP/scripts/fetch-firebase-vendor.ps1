# Fetch Firebase ESM vendor bundles into ./vendor
# Run this from PowerShell in the extension root:
#   powershell -ExecutionPolicy Bypass -File .\scripts\fetch-firebase-vendor.ps1

$vendorDir = Join-Path $PSScriptRoot "..\vendor"
if (-not (Test-Path $vendorDir)) { New-Item -ItemType Directory -Path $vendorDir | Out-Null }

$files = @(
    @{ url = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js'; dest = 'firebase-app.js' },
    @{ url = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-firestore.js'; dest = 'firebase-firestore.js' },
    @{ url = 'https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js'; dest = 'firebase-auth.js' }
)

foreach ($f in $files) {
    $destPath = Join-Path $vendorDir $f.dest
    Write-Host "Downloading $($f.url) => $destPath"
    try {
        Invoke-WebRequest -Uri $f.url -OutFile $destPath -UseBasicParsing -ErrorAction Stop
        Write-Host "Saved $destPath"
    } catch {
        Write-Warning "Failed to download $($f.url): $_"
    }
}

Write-Host "Done. Please reload the extension in chrome://extensions and check the background service worker console for logs."