# Build, Install, and Launch Butu TV App
# Usage: ./install.ps1

$JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"

Write-Host "==========================================" -ForegroundColor Cyan
Write-Host "1. Building and installing Butu on TV..." -ForegroundColor Cyan
Write-Host "==========================================" -ForegroundColor Cyan

& .\gradlew "-Dorg.gradle.java.home=$JAVA_HOME" installDebug

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Green
    Write-Host "2. Installation Succeeded! Launching app..." -ForegroundColor Green
    Write-Host "==========================================" -ForegroundColor Green
    & adb shell am start -n dev.butu.debug/dev.butu.MainActivity
} else {
    Write-Host ""
    Write-Host "==========================================" -ForegroundColor Red
    Write-Host "Build failed." -ForegroundColor Red
    Write-Host "==========================================" -ForegroundColor Red
}
