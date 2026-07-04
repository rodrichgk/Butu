//! The I/O seam that decouples the detector from any particular process host.
//!
//! The detector needs to run two external programs — `ffmpeg` (decode / probe /
//! black-frame) and `fpcalc` (chromaprint fingerprint) — but *how* they're
//! spawned differs by host: the Tauri app runs them as bundled sidecars through
//! its shell plugin, while the benchmark (and any crates.io consumer) just
//! spawns the binaries. Both implement [`MediaRunner`]; everything above this
//! trait is host-agnostic.

use async_trait::async_trait;

/// Captured result of one external command invocation.
#[derive(Debug, Clone)]
pub struct CmdOutput {
    /// Process exit code (`-1` if it couldn't be determined).
    pub code: i32,
    /// Full stdout bytes (fpcalc JSON, ffmetadata, `metadata=print` output …).
    pub stdout: Vec<u8>,
    /// Captured stderr as text (ffmpeg logs, blackdetect lines …). Implementations
    /// may cap this to bound memory, but should keep enough for diagnostics.
    pub stderr: String,
}

/// Runs the `ffmpeg` / `fpcalc` binaries and returns their captured output.
///
/// `args` are passed verbatim (no shell parsing). Implementations must NOT treat
/// a non-zero exit code as an `Err` — return the [`CmdOutput`] and let callers
/// decide, because some callers tolerate failures (e.g. best-effort chapters).
/// `Err` is reserved for "couldn't even spawn / run the process".
#[async_trait]
pub trait MediaRunner: Send + Sync {
    async fn ffmpeg(&self, args: &[String]) -> Result<CmdOutput, String>;
    async fn fpcalc(&self, args: &[String]) -> Result<CmdOutput, String>;
}

/// A [`MediaRunner`] that spawns the `ffmpeg`/`fpcalc` executables at the given
/// paths via `tokio::process`. Enabled by the `process` feature.
#[cfg(feature = "process")]
pub struct ProcessRunner {
    pub ffmpeg: std::path::PathBuf,
    pub fpcalc: std::path::PathBuf,
}

#[cfg(feature = "process")]
impl ProcessRunner {
    pub fn new(
        ffmpeg: impl Into<std::path::PathBuf>,
        fpcalc: impl Into<std::path::PathBuf>,
    ) -> Self {
        Self {
            ffmpeg: ffmpeg.into(),
            fpcalc: fpcalc.into(),
        }
    }
}

#[cfg(feature = "process")]
#[async_trait]
impl MediaRunner for ProcessRunner {
    async fn ffmpeg(&self, args: &[String]) -> Result<CmdOutput, String> {
        run_process(&self.ffmpeg, args).await
    }
    async fn fpcalc(&self, args: &[String]) -> Result<CmdOutput, String> {
        run_process(&self.fpcalc, args).await
    }
}

#[cfg(feature = "process")]
async fn run_process(bin: &std::path::Path, args: &[String]) -> Result<CmdOutput, String> {
    let output = tokio::process::Command::new(bin)
        .args(args)
        .output()
        .await
        .map_err(|e| format!("spawn {}: {e}", bin.display()))?;
    Ok(CmdOutput {
        code: output.status.code().unwrap_or(-1),
        stdout: output.stdout,
        stderr: String::from_utf8_lossy(&output.stderr).into_owned(),
    })
}
