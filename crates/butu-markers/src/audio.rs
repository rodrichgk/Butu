//! ffmpeg invocation. Decodes a `[start, start+len]` window of a media stream to
//! raw mono s16le PCM, written to a temp file the caller is responsible for
//! cleaning up.
//!
//! Why mono s16le: this is exactly what `fpcalc` expects when fed with explicit
//! `-rate -channels`. Keeping the path raw (not WAV) avoids extra demux overhead
//! on the fpcalc side.

use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::runner::MediaRunner;

pub const SAMPLE_RATE: u32 = 22_050;
pub const CHANNELS: u8 = 1;

/// Decode rate used by the *fast* pipeline. Chromaprint downsamples everything to
/// 11025 Hz internally anyway, so decoding straight to that halves the PCM we
/// write + the samples fpcalc has to chew through, with no loss of hash fidelity.
pub const SAMPLE_RATE_FAST: u32 = 11_025;

fn header_arg(headers: Option<&HashMap<String, String>>) -> Option<String> {
    headers
        .map(|h| {
            h.iter()
                .map(|(k, v)| format!("{k}: {v}\r\n"))
                .collect::<String>()
        })
        .filter(|s| !s.is_empty())
}

fn new_pcm_path() -> Result<PathBuf, String> {
    let temp_dir = std::env::temp_dir().join("butu-analysis");
    std::fs::create_dir_all(&temp_dir).map_err(|e| format!("create tmpdir: {e}"))?;
    Ok(temp_dir.join(format!("{}.pcm", uuid::Uuid::new_v4())))
}

/// Runs the built ffmpeg args, deleting `out_path` and erroring on non-zero exit.
async fn run_extract(
    runner: &dyn MediaRunner,
    args: Vec<String>,
    out_path: PathBuf,
) -> Result<PathBuf, String> {
    let out = runner.ffmpeg(&args).await?;
    if out.code != 0 {
        let _ = std::fs::remove_file(&out_path);
        return Err(format!(
            "ffmpeg exited with code {}: {}",
            out.code,
            out.stderr.trim()
        ));
    }
    Ok(out_path)
}

/// Pulls `duration_secs` of audio starting at `start_secs` from `stream_url`,
/// writes raw mono 22050 Hz s16le PCM to a fresh temp path, and returns it.
///
/// `headers` map gets forwarded to ffmpeg via `-headers` so Plex/Jellyfin auth
/// tokens travel along.
pub async fn extract_pcm_window(
    runner: &dyn MediaRunner,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    start_secs: u64,
    duration_secs: u64,
) -> Result<PathBuf, String> {
    let out_path = new_pcm_path()?;

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
    if let Some(h) = header_arg(headers) {
        args.push("-headers".into());
        args.push(h);
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

    run_extract(runner, args, out_path).await
}

/// Fast-pipeline audio extraction. Same job as [`extract_pcm_window`] but tuned
/// for the remote-stream, high-throughput path:
///   * `-vn -map 0:a:0?` — never touch the video stream (no frames decoded, no
///     hwaccel context spun up). For an audio-only fingerprint that's pure waste.
///   * no `-hwaccel auto` — it does nothing for audio and only adds probe/init.
///   * decodes straight to 11025 Hz mono ([`SAMPLE_RATE_FAST`]).
/// Kept separate from the legacy extractor so the original algorithm's output is
/// byte-for-byte unchanged for A/B comparison.
pub async fn extract_pcm_window_fast(
    runner: &dyn MediaRunner,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    start_secs: u64,
    duration_secs: u64,
) -> Result<PathBuf, String> {
    let out_path = new_pcm_path()?;

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-nostdin".into(),
        // Fast seek (snaps to keyframe); for a remote stream this range-requests
        // the tail instead of pulling the whole file.
        "-ss".into(),
        start_secs.to_string(),
    ];
    if let Some(h) = header_arg(headers) {
        args.push("-headers".into());
        args.push(h);
    }
    args.extend([
        "-i".into(),
        stream_url.to_string(),
        "-t".into(),
        duration_secs.to_string(),
        // Audio only — drop video so ffmpeg never decodes a single frame.
        "-vn".into(),
        "-map".into(),
        "0:a:0?".into(),
        "-ac".into(),
        CHANNELS.to_string(),
        "-ar".into(),
        SAMPLE_RATE_FAST.to_string(),
        "-f".into(),
        "s16le".into(),
        "-y".into(),
        out_path.to_string_lossy().into_owned(),
    ]);

    run_extract(runner, args, out_path).await
}

/// Best-effort cleanup. Logs on failure; never panics.
pub fn cleanup_pcm(path: &Path) {
    if let Err(e) = std::fs::remove_file(path) {
        tracing::warn!("failed to delete tmp pcm {}: {e}", path.display());
    }
}
