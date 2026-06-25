//! ffmpeg sidecar invocation. Decodes a `[start, start+len]` window of a media
//! stream to raw mono 22050 Hz signed 16-bit little-endian PCM, written to a
//! temp file that the caller is responsible for cleaning up.
//!
//! Why mono 22050 Hz s16le: this is exactly what `fpcalc` expects when fed
//! over stdin via `-rate -channels`. Keeping the path raw (not WAV) avoids
//! extra demux overhead on the fpcalc side.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

pub const SAMPLE_RATE: u32 = 22_050;
pub const CHANNELS: u8 = 1;

/// Pulls `duration_secs` of audio starting at `start_secs` from `stream_url`,
/// writes raw mono 22050 Hz s16le PCM to a fresh temp path, and returns it.
///
/// `headers` map gets forwarded to ffmpeg via `-headers` so Plex/Jellyfin auth
/// tokens travel along — the React side already builds the Url with `?X-Plex-Token=`
/// embedded, but for Jellyfin we sometimes need bearer headers too.
pub async fn extract_pcm_window(
    app: &AppHandle,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    start_secs: u64,
    duration_secs: u64,
) -> Result<PathBuf, String> {
    let temp_dir = std::env::temp_dir().join("butu-analysis");
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("create tmpdir: {e}"))?;
    let out_path = temp_dir.join(format!("{}.pcm", uuid::Uuid::new_v4()));

    let header_arg = headers.map(|h| {
        h.iter()
            .map(|(k, v)| format!("{k}: {v}\r\n"))
            .collect::<String>()
    });

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-nostdin".into(),
        "-hwaccel".into(),
        "auto".into(),
        // -ss before -i = fast seek (snaps to keyframe); accurate enough for the
        // first ~6 min of a TV episode and avoids decoding past content for credits.
        "-ss".into(),
        start_secs.to_string(),
    ];
    if let Some(h) = header_arg.as_deref() {
        if !h.is_empty() {
            args.push("-headers".into());
            args.push(h.to_string());
        }
    }
    args.extend([
        "-i".into(),
        stream_url.to_string(),
        "-t".into(),
        duration_secs.to_string(),
        "-ac".into(),
        CHANNELS.to_string(),
        "-ar".into(),
        SAMPLE_RATE.to_string(),
        "-f".into(),
        "s16le".into(),
        "-y".into(),
        out_path.to_string_lossy().into_owned(),
    ]);

    let shell = app.shell();
    let cmd = shell
        .sidecar("ffmpeg")
        .map_err(|e| format!("ffmpeg sidecar not found: {e}"))?
        .args(&args);

    let (mut rx, _child) = cmd.spawn().map_err(|e| format!("ffmpeg spawn: {e}"))?;

    let mut stderr_tail = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stderr(bytes) => {
                if stderr_tail.len() < 4_000 {
                    stderr_tail.push_str(&String::from_utf8_lossy(&bytes));
                }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code.unwrap_or(1) != 0 {
                    let _ = std::fs::remove_file(&out_path);
                    return Err(format!(
                        "ffmpeg exited with code {:?}: {}",
                        payload.code,
                        stderr_tail.trim()
                    ));
                }
                break;
            }
            _ => {}
        }
    }

    Ok(out_path)
}

/// Best-effort cleanup. Logs on failure; never panics.
pub fn cleanup_pcm(path: &Path) {
    if let Err(e) = std::fs::remove_file(path) {
        tracing::warn!("failed to delete tmp pcm {}: {e}", path.display());
    }
}
