//! Tauri host adapter for the `butu-markers` detector.
//!
//! Implements the crate's two decoupling traits over Tauri: [`TauriRunner`] runs
//! the bundled `ffmpeg`/`fpcalc` sidecars through the shell plugin, and
//! [`TauriSink`] forwards progress events to the JS UI via `app.emit`.

use async_trait::async_trait;
use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

use butu_markers::runner::{CmdOutput, MediaRunner};
use butu_markers::types::ProgressEvent;
use butu_markers::ProgressSink;

/// Cap on captured stderr, matching the old streaming loops' memory bound.
const STDERR_CAP: usize = 256_000;

/// A [`MediaRunner`] backed by the app's bundled ffmpeg/fpcalc sidecars.
pub struct TauriRunner {
    app: AppHandle,
}

impl TauriRunner {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }

    async fn run(&self, bin: &str, args: &[String]) -> Result<CmdOutput, String> {
        let shell = self.app.shell();
        let cmd = shell
            .sidecar(bin)
            .map_err(|e| format!("{bin} sidecar not found: {e}"))?
            .args(args);

        let (mut rx, _child) = cmd.spawn().map_err(|e| format!("{bin} spawn: {e}"))?;

        let mut stdout = Vec::new();
        let mut stderr = String::new();
        let mut code = -1;
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => stdout.extend_from_slice(&bytes),
                CommandEvent::Stderr(bytes) => {
                    if stderr.len() < STDERR_CAP {
                        stderr.push_str(&String::from_utf8_lossy(&bytes));
                    }
                }
                CommandEvent::Terminated(payload) => {
                    code = payload.code.unwrap_or(-1);
                    break;
                }
                _ => {}
            }
        }
        Ok(CmdOutput { code, stdout, stderr })
    }
}

#[async_trait]
impl MediaRunner for TauriRunner {
    async fn ffmpeg(&self, args: &[String]) -> Result<CmdOutput, String> {
        self.run("ffmpeg", args).await
    }
    async fn fpcalc(&self, args: &[String]) -> Result<CmdOutput, String> {
        self.run("fpcalc", args).await
    }
}

/// A [`ProgressSink`] that re-emits pipeline events to the JS UI.
pub struct TauriSink {
    app: AppHandle,
}

impl TauriSink {
    pub fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl ProgressSink for TauriSink {
    fn emit(&self, ev: &ProgressEvent) {
        if let Err(e) = self.app.emit("analysis-progress", ev) {
            tracing::warn!("emit analysis-progress failed: {e}");
        }
    }
}
