# Sidecar binaries — ffmpeg + fpcalc

Tauri ships these inside the companion-app bundle so the marker auto-detect
pipeline doesn't depend on what the contributor has installed. The repo
contains **empty placeholder files** so `cargo build` succeeds; you must
overwrite them with real binaries before the pipeline will function.

## Quick setup (Windows)

From the repo root, run:

```powershell
.\src-tauri\binaries\fetch.ps1
```

This downloads ffmpeg + fpcalc release builds, verifies them, and copies them
into this directory with the Tauri-required filename pattern
`<name>-<target-triple>.exe`.

## Manual setup

You need two binaries with the right names:

- `ffmpeg-x86_64-pc-windows-msvc.exe` — any recent static ffmpeg build works.
  Recommended source: https://www.gyan.dev/ffmpeg/builds/ → "release essentials".
  Inside the zip, copy `bin/ffmpeg.exe` here, renamed.

- `fpcalc-x86_64-pc-windows-msvc.exe` — chromaprint's audio fingerprint CLI.
  Source: https://acoustid.org/chromaprint → latest Windows zip.
  Copy `fpcalc.exe` here, renamed.

For Linux / macOS builds add per-target binaries:

- `ffmpeg-x86_64-unknown-linux-gnu`
- `fpcalc-x86_64-unknown-linux-gnu`
- `ffmpeg-aarch64-apple-darwin`
- `fpcalc-aarch64-apple-darwin`
- `ffmpeg-x86_64-apple-darwin`
- `fpcalc-x86_64-apple-darwin`

## Why not just use system ffmpeg / fpcalc?

Tauri sidecars eliminate the "works on my machine" problem for contributors —
the auto-detect pipeline runs the same way for everyone, regardless of which
ffmpeg build they happen to have on `PATH`. The trade-off is a ~50 MB increase
in installer size per target, which is acceptable for the desktop companion.

## File-size sanity check

After fetching, the binaries should be roughly:

- ffmpeg: 70–120 MB (static build with full codec support)
- fpcalc: 2–4 MB

If the placeholder 0-byte files survive your build, the sidecar invocations
will fail at runtime with "process exited with code 1" or similar.
