//! fpcalc (chromaprint) invocation.
//!
//! `fpcalc` reads our raw mono s16le PCM file and emits a chromaprint: a sequence
//! of 32-bit unsigned integers, one every ~0.124 s. Comparing two chromaprints
//! under Hamming distance is the standard "is this the same audio?" primitive —
//! what AcoustID uses for music ID, and what Jellyfin's IntroSkipper uses to
//! align intros.

use std::path::Path;

use serde::Deserialize;

use crate::runner::MediaRunner;

#[derive(Deserialize)]
struct FpcalcRawOut {
    #[serde(default)]
    duration: f64,
    /// The raw fingerprint as a list of unsigned 32-bit integers.
    fingerprint: Vec<u32>,
}

pub struct Fingerprint {
    pub hashes: Vec<u32>,
    pub duration_secs: f64,
}

impl Fingerprint {
    /// Milliseconds of audio represented by each fingerprint hash.
    ///
    /// Derived from fpcalc's reported `duration` instead of assumed from our
    /// input sample rate. Chromaprint downsamples internally to 11025 Hz before
    /// framing, so the hash rate is NOT `frame_size / SAMPLE_RATE` (which gave a
    /// wrong ~0.186 s and stretched every timestamp by ~1.5x). `duration / len`
    /// is the only reliable way to map a hash index back to a real offset — it
    /// lands on chromaprint's true ~0.124 s/hash regardless of input rate.
    pub fn ms_per_hash(&self) -> f64 {
        if self.hashes.is_empty() {
            0.0
        } else {
            self.duration_secs * 1000.0 / self.hashes.len() as f64
        }
    }
}

/// Run fpcalc against a raw PCM file. `-raw` returns integer hashes (vs the
/// default base64 encoding), `-json` is parsed below. Limits scan to
/// `max_seconds` so we don't fingerprint more than the window we care about.
pub async fn fingerprint_pcm(
    runner: &dyn MediaRunner,
    pcm_path: &Path,
    max_seconds: u32,
) -> Result<Fingerprint, String> {
    fingerprint_pcm_rate(
        runner,
        pcm_path,
        max_seconds,
        crate::audio::SAMPLE_RATE,
        crate::audio::CHANNELS,
    )
    .await
}

/// Same as [`fingerprint_pcm`] but with an explicit input sample rate + channel
/// count, so the fast pipeline can feed 11025 Hz PCM without a second constant
/// path. The `-rate`/`-channels` hints MUST match how the PCM was decoded, or
/// fpcalc mis-frames the audio and the hashes shift.
pub async fn fingerprint_pcm_rate(
    runner: &dyn MediaRunner,
    pcm_path: &Path,
    max_seconds: u32,
    rate: u32,
    channels: u8,
) -> Result<Fingerprint, String> {
    let args: Vec<String> = vec![
        "-raw".into(),
        "-json".into(),
        "-length".into(),
        max_seconds.to_string(),
        // fpcalc autodetects format for known containers; raw PCM needs explicit hints.
        "-rate".into(),
        rate.to_string(),
        "-channels".into(),
        channels.to_string(),
        "-format".into(),
        "s16le".into(),
        pcm_path.to_string_lossy().into_owned(),
    ];

    let out = runner.fpcalc(&args).await?;
    if out.code != 0 {
        return Err(format!("fpcalc exited with code {}: {}", out.code, out.stderr.trim()));
    }

    let parsed: FpcalcRawOut = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("fpcalc json parse: {e}; output={:?}", String::from_utf8_lossy(&out.stdout)))?;

    if parsed.fingerprint.is_empty() {
        return Err("fpcalc returned empty fingerprint".into());
    }

    Ok(Fingerprint {
        hashes: parsed.fingerprint,
        duration_secs: parsed.duration,
    })
}
