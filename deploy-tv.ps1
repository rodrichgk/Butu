# Build, install, and launch the native Butu Android TV app (dev.butu) on the TV.
# This deploys the NATIVE Kotlin app — not the old Tauri Android build (which has been retired;
# Tauri is the Windows desktop companion only).
$ErrorActionPreference = "Stop"

$device = "192.168.1.176:5555"
$adb    = "C:\Users\Utilisateur\AppData\Local\Android\Sdk\platform-tools\adb.exe"

function Measure-Phase {
  param([string]$Name, [scriptblock]$Block)
  $sw = [System.Diagnostics.Stopwatch]::StartNew()
  Write-Host "[PHASE START] $Name" -ForegroundColor Cyan
  & $Block
  $sw.Stop()
  Write-Host ("[PHASE DONE]  {0,-22} {1,7:N1}s" -f $Name, $sw.Elapsed.TotalSeconds) -ForegroundColor Green
}

$total = [System.Diagnostics.Stopwatch]::StartNew()

Measure-Phase "adb connect" {
  & $adb connect $device
}

Measure-Phase "gradle installDebug" {
  Push-Location "$PSScriptRoot\android"
  try { .\gradlew.bat :app:installDebug --console=plain } finally { Pop-Location }
}

Measure-Phase "launch" {
  & $adb -s $device shell am start -n dev.butu.debug/dev.butu.MainActivity
}

$total.Stop()
Write-Host ("`n[TOTAL]       {0,7:N1}s" -f $total.Elapsed.TotalSeconds) -ForegroundColor Yellow
