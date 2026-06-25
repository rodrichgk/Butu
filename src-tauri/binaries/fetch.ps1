#requires -Version 5
<#
.SYNOPSIS
    Fetches ffmpeg + fpcalc release binaries and places them with the
    Tauri-required <name>-<target-triple>.exe naming.

.DESCRIPTION
    Run once before `tauri dev` / `tauri build` if you want the marker
    auto-detect pipeline to actually function. See README.md for context.
#>

$ErrorActionPreference = "Stop"

$dest = $PSScriptRoot
$triple = "x86_64-pc-windows-msvc"

$ffmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"
$fpcalcUrl = "https://github.com/acoustid/chromaprint/releases/download/v1.5.1/chromaprint-fpcalc-1.5.1-windows-x86_64.zip"

$tempDir = Join-Path $env:TEMP "butu-sidecar-fetch"
if (Test-Path $tempDir) { Remove-Item $tempDir -Recurse -Force }
New-Item -ItemType Directory -Path $tempDir | Out-Null

function Download-Zip {
    param([string]$url, [string]$out)
    Write-Host "  -> $url"
    Invoke-WebRequest -Uri $url -OutFile $out -UseBasicParsing
}

function Extract-Single {
    param([string]$zip, [string]$pattern, [string]$out)
    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $archive = [System.IO.Compression.ZipFile]::OpenRead($zip)
    try {
        $entry = $archive.Entries | Where-Object { $_.FullName -like $pattern } | Select-Object -First 1
        if (-not $entry) { throw "no entry matching $pattern in $zip" }
        $tmp = "$out.tmp"
        [System.IO.Compression.ZipFileExtensions]::ExtractToFile($entry, $tmp, $true)
        Move-Item $tmp $out -Force
    } finally {
        $archive.Dispose()
    }
}

Write-Host "==== Butu sidecar fetcher ====" -ForegroundColor Cyan
Write-Host "Triple: $triple"
Write-Host "Destination: $dest"
Write-Host ""

# ─── ffmpeg ──────────────────────────────────────────────────────────────────
Write-Host "[1/2] Downloading ffmpeg release-essentials..." -ForegroundColor Yellow
$ffmpegZip = Join-Path $tempDir "ffmpeg.zip"
Download-Zip $ffmpegUrl $ffmpegZip

Write-Host "      Extracting ffmpeg.exe..."
$ffmpegOut = Join-Path $dest "ffmpeg-$triple.exe"
Extract-Single $ffmpegZip "*ffmpeg-*-essentials_build/bin/ffmpeg.exe" $ffmpegOut

$len = (Get-Item $ffmpegOut).Length
Write-Host ("      done -> {0:N1} MB" -f ($len / 1MB)) -ForegroundColor Green
Write-Host ""

# ─── fpcalc ──────────────────────────────────────────────────────────────────
Write-Host "[2/2] Downloading fpcalc (chromaprint) v1.5.1..." -ForegroundColor Yellow
$fpcalcZip = Join-Path $tempDir "fpcalc.zip"
Download-Zip $fpcalcUrl $fpcalcZip

Write-Host "      Extracting fpcalc.exe..."
$fpcalcOut = Join-Path $dest "fpcalc-$triple.exe"
Extract-Single $fpcalcZip "*fpcalc.exe" $fpcalcOut

$len = (Get-Item $fpcalcOut).Length
Write-Host ("      done -> {0:N1} MB" -f ($len / 1MB)) -ForegroundColor Green
Write-Host ""

Write-Host "All sidecars in place. You can now run `tauri dev` / `tauri build`." -ForegroundColor Green
Remove-Item $tempDir -Recurse -Force
