//! Turns a `Root/Show (Year)/Season NN/Show SxxEyy.ext` tree into the
//! [`ShowInput`] the detector consumes, and probes each file's duration.

use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::Arc;

use butu_markers::types::{EpisodeInput, MediaKind, SeasonInput, ShowInput};
use butu_markers::MediaRunner;
use futures_util::stream::{self, StreamExt};

use crate::netsim::NetSim;

const VIDEO_EXTS: &[&str] = &["mkv", "mp4", "avi", "m4v", "ts", "mov"];

#[derive(Clone)]
pub struct ScannedEpisode {
    /// Stable join key across runs (relative path, forward slashes).
    pub id: String,
    pub season: i32,
    pub episode: i32,
    pub duration_ms: u64,
    pub abs_path: PathBuf,
    pub rel_path: String,
}

#[derive(Clone)]
pub struct ScannedShow {
    pub title: String,
    pub external_id: String,
    pub episodes: Vec<ScannedEpisode>,
}

/// Walks `root`. Each immediate sub-directory is a show; `Season NN` folders hold
/// episodes. `filter` (if given) keeps only shows whose folder name contains one
/// of the entries (case-insensitive). Durations are left at 0 until probed.
pub fn scan(root: &Path, filter: Option<&[String]>) -> anyhow::Result<Vec<ScannedShow>> {
    let mut shows = Vec::new();
    let mut idx = 0u32;

    let mut entries: Vec<_> = std::fs::read_dir(root)?
        .filter_map(|e| e.ok())
        .filter(|e| e.path().is_dir())
        .collect();
    entries.sort_by_key(|e| e.file_name());

    for entry in entries {
        let dir_name = entry.file_name().to_string_lossy().into_owned();
        if dir_name.starts_with('.') {
            continue;
        }
        if let Some(f) = filter {
            let lower = dir_name.to_ascii_lowercase();
            if !f.iter().any(|want| lower.contains(&want.to_ascii_lowercase())) {
                continue;
            }
        }

        let episodes = collect_episodes(root, &entry.path());
        if episodes.is_empty() {
            continue;
        }
        idx += 1;
        shows.push(ScannedShow {
            title: strip_year(&dir_name),
            // Dummy but well-formed id so `pick_external_id` accepts the show.
            external_id: format!("tmdb://{idx}"),
            episodes,
        });
    }
    Ok(shows)
}

fn collect_episodes(root: &Path, show_dir: &Path) -> Vec<ScannedEpisode> {
    let mut out = Vec::new();
    // Recurse one level into Season folders (and also accept files directly).
    let mut stack = vec![show_dir.to_path_buf()];
    while let Some(dir) = stack.pop() {
        let Ok(rd) = std::fs::read_dir(&dir) else { continue };
        for e in rd.filter_map(|e| e.ok()) {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
                continue;
            }
            let ext = p
                .extension()
                .and_then(|s| s.to_str())
                .map(|s| s.to_ascii_lowercase())
                .unwrap_or_default();
            if !VIDEO_EXTS.contains(&ext.as_str()) {
                continue;
            }
            let name = p.file_name().unwrap_or_default().to_string_lossy().into_owned();
            let Some((season, episode)) = parse_se(&name) else { continue };
            let rel = p
                .strip_prefix(root)
                .unwrap_or(&p)
                .to_string_lossy()
                .replace('\\', "/");
            out.push(ScannedEpisode {
                id: rel.clone(),
                season,
                episode,
                duration_ms: 0,
                abs_path: p,
                rel_path: rel,
            });
        }
    }
    out.sort_by_key(|e| (e.season, e.episode));
    out
}

/// Keeps only the given season numbers; drops shows left with <2 episodes.
pub fn filter_seasons(shows: &mut Vec<ScannedShow>, seasons: &[i32]) {
    for s in shows.iter_mut() {
        s.episodes.retain(|e| seasons.contains(&e.season));
    }
    shows.retain(|s| s.episodes.len() >= 2);
}

/// Probes every episode's duration via `ffmpeg -i` (parses the `Duration:` line),
/// concurrently. Episodes whose probe fails are dropped.
pub async fn probe_durations(
    runner: &Arc<dyn MediaRunner>,
    shows: &mut Vec<ScannedShow>,
    concurrency: usize,
) {
    for show in shows.iter_mut() {
        let probed: Vec<ScannedEpisode> = stream::iter(show.episodes.clone())
            .map(|mut ep| {
                let runner = runner.clone();
                async move {
                    let args = vec![
                        "-hide_banner".to_string(),
                        "-i".to_string(),
                        ep.abs_path.to_string_lossy().into_owned(),
                    ];
                    // `-i` with no output exits non-zero but prints Duration to stderr.
                    if let Ok(out) = runner.ffmpeg(&args).await {
                        if let Some(ms) = parse_duration_ms(&out.stderr) {
                            ep.duration_ms = ms;
                            return Some(ep);
                        }
                    }
                    None
                }
            })
            .buffered(concurrency.max(1))
            .collect::<Vec<_>>()
            .await
            .into_iter()
            .flatten()
            .collect();
        show.episodes = probed;
    }
    shows.retain(|s| s.episodes.len() >= 2);
}

/// Builds the detector's [`ShowInput`] tree. When `server` is `Some`, stream URLs
/// point at the netsim HTTP server; otherwise they're direct local file paths.
pub fn to_show_inputs(shows: &[ScannedShow], server: Option<&NetSim>) -> Vec<ShowInput> {
    shows
        .iter()
        .map(|s| {
            let mut by_season: BTreeMap<i32, Vec<EpisodeInput>> = BTreeMap::new();
            for ep in &s.episodes {
                let stream_url = match server {
                    Some(srv) => srv.url_for(&ep.rel_path),
                    None => ep.abs_path.to_string_lossy().into_owned(),
                };
                by_season.entry(ep.season).or_default().push(EpisodeInput {
                    id: ep.id.clone(),
                    stream_url,
                    duration_ms: ep.duration_ms,
                    season: ep.season,
                    episode: ep.episode,
                    headers: None,
                });
            }
            let seasons = by_season
                .into_iter()
                .map(|(season_number, episodes)| SeasonInput { season_number, episodes })
                .collect();
            ShowInput {
                title: s.title.clone(),
                external_ids: vec![s.external_id.clone()],
                kind: MediaKind::Tv,
                seasons,
            }
        })
        .collect()
}

/// `"Game of Thrones (2011)"` → `"Game of Thrones"`.
fn strip_year(name: &str) -> String {
    let t = name.trim();
    if let Some(idx) = t.rfind('(') {
        let tail = &t[idx..];
        if tail.len() >= 6 && tail[1..5].chars().all(|c| c.is_ascii_digit()) {
            return t[..idx].trim().to_string();
        }
    }
    t.to_string()
}

/// Extracts (season, episode) from an `SxxEyy` token (case-insensitive).
fn parse_se(name: &str) -> Option<(i32, i32)> {
    let bytes = name.as_bytes();
    let upper = name.to_ascii_uppercase();
    let s_pos = upper.find('S')?;
    // Scan for S<digits>E<digits> starting at each 'S'.
    let mut search_from = s_pos;
    loop {
        let rel = upper[search_from..].find('S')?;
        let i = search_from + rel;
        if let Some(res) = try_parse_se_at(bytes, i) {
            return Some(res);
        }
        search_from = i + 1;
        if search_from >= upper.len() {
            return None;
        }
    }
}

fn try_parse_se_at(bytes: &[u8], i: usize) -> Option<(i32, i32)> {
    let mut j = i + 1;
    let start_s = j;
    while j < bytes.len() && bytes[j].is_ascii_digit() {
        j += 1;
    }
    if j == start_s {
        return None;
    }
    let season: i32 = std::str::from_utf8(&bytes[start_s..j]).ok()?.parse().ok()?;
    if j >= bytes.len() || !(bytes[j] == b'E' || bytes[j] == b'e') {
        return None;
    }
    j += 1;
    let start_e = j;
    while j < bytes.len() && bytes[j].is_ascii_digit() {
        j += 1;
    }
    if j == start_e {
        return None;
    }
    let episode: i32 = std::str::from_utf8(&bytes[start_e..j]).ok()?.parse().ok()?;
    Some((season, episode))
}

/// Parses `Duration: HH:MM:SS.ss` out of ffmpeg's stderr into milliseconds.
fn parse_duration_ms(stderr: &str) -> Option<u64> {
    let idx = stderr.find("Duration:")?;
    let rest = stderr[idx + "Duration:".len()..].trim_start();
    let tok: String = rest.chars().take_while(|c| *c != ',').collect();
    let tok = tok.trim();
    let mut parts = tok.split(':');
    let h: u64 = parts.next()?.trim().parse().ok()?;
    let m: u64 = parts.next()?.parse().ok()?;
    let s: f64 = parts.next()?.parse().ok()?;
    Some((h * 3600 + m * 60) * 1000 + (s * 1000.0) as u64)
}
