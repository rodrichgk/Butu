//! A [`MediaRunner`] that caches **ffmpeg** outputs on disk so repeated runs skip
//! the expensive decode. The dominant cost (audio decode + the video Phase-B
//! passes) is deterministic in the ffmpeg args for a fixed source file, so we key
//! on the args and stash the produced PCM / stdout / stderr. `fpcalc` is cheap and
//! passed straight through.
//!
//! This turns a ~12-min full-show validation into ~30 s on the second run, which
//! is what makes accuracy tuning against ground truth practical. (Cache keys
//! include the stream URL, so netsim runs — random ports — naturally miss; use it
//! for latency-0 local-path iteration.)

use std::hash::{Hash, Hasher};
use std::path::PathBuf;

use async_trait::async_trait;
use butu_markers::runner::{CmdOutput, MediaRunner};
use butu_markers::ProcessRunner;

pub struct CachingRunner {
    inner: ProcessRunner,
    dir: PathBuf,
}

impl CachingRunner {
    pub fn new(inner: ProcessRunner, dir: PathBuf) -> std::io::Result<Self> {
        std::fs::create_dir_all(&dir)?;
        Ok(Self { inner, dir })
    }
}

#[derive(serde::Serialize, serde::Deserialize)]
struct Meta {
    code: i32,
    stderr: String,
}

fn hash_key(parts: &[String]) -> String {
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for p in parts {
        p.hash(&mut h);
    }
    format!("{:016x}", h.finish())
}

/// ffmpeg audio extraction ends with `-y <uuid>.pcm`; the uuid varies per call, so
/// drop that output path from the cache key (the produced file is cached
/// separately). Video passes output to `-` and are keyed on the full args.
fn ffmpeg_key(args: &[String]) -> (String, Option<PathBuf>) {
    let out = args
        .last()
        .filter(|a| a.ends_with(".pcm"))
        .map(PathBuf::from);
    let key_slice = if out.is_some() {
        &args[..args.len() - 1]
    } else {
        args
    };
    (hash_key(key_slice), out)
}

#[async_trait]
impl MediaRunner for CachingRunner {
    async fn ffmpeg(&self, args: &[String]) -> Result<CmdOutput, String> {
        let (key, out) = ffmpeg_key(args);
        let meta_p = self.dir.join(format!("{key}.meta.json"));
        let stdout_p = self.dir.join(format!("{key}.stdout"));
        let pcm_p = self.dir.join(format!("{key}.pcm"));

        if let Ok(bytes) = std::fs::read(&meta_p) {
            if let Ok(meta) = serde_json::from_slice::<Meta>(&bytes) {
                let stdout = std::fs::read(&stdout_p).unwrap_or_default();
                if let Some(op) = &out {
                    if pcm_p.exists() {
                        std::fs::copy(&pcm_p, op).map_err(|e| format!("cache restore pcm: {e}"))?;
                    }
                }
                return Ok(CmdOutput {
                    code: meta.code,
                    stdout,
                    stderr: meta.stderr,
                });
            }
        }

        let res = self.inner.ffmpeg(args).await?;
        // Best-effort store; a failed write just means a future cache miss.
        let _ = std::fs::write(&stdout_p, &res.stdout);
        if let Some(op) = &out {
            if op.exists() {
                let _ = std::fs::copy(op, &pcm_p);
            }
        }
        if let Ok(bytes) = serde_json::to_vec(&Meta {
            code: res.code,
            stderr: res.stderr.clone(),
        }) {
            let _ = std::fs::write(&meta_p, bytes);
        }
        Ok(res)
    }

    async fn fpcalc(&self, args: &[String]) -> Result<CmdOutput, String> {
        self.inner.fpcalc(args).await
    }
}
