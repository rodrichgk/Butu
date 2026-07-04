//! Library-walking orchestrator (the original / "legacy" algorithm). Decides what
//! windows to fingerprint, calls the audio + fingerprint modules per episode, runs
//! detection per season, emits progress events, and returns the flattened
//! episode-result list the caller ships to the submission flow.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use futures_util::stream::{self, StreamExt};

use crate::audio::{cleanup_pcm, extract_pcm_window};
use crate::detect::{detect_markers, Detection};
use crate::fingerprint::{fingerprint_pcm, Fingerprint};
use crate::progress::ProgressSink;
use crate::runner::MediaRunner;
use crate::segment::{detect_credits_blackframe, find_credits_fade_in_range, read_chapters};
use crate::types::{
    DetectedMarker, EpisodeInput, EpisodeResult, EpisodeStage, MarkerType, MediaKind,
    ProgressEvent, SeasonInput, ShowInput,
};

/// Scan window for intros: first 15 minutes of each episode.
///
/// 15 min covers ~99 % of cold-open variations. Standard 22-min comedies fit
/// fully; HBO/anime cold opens (Westworld pilot, Attack on Titan, Stranger
/// Things finales) routinely run 10–12 min and would be missed by a 6-min
/// window. Cost is linear in ffmpeg decode time + fingerprint memory.
const INTRO_WINDOW_START_S: u64 = 0;
const INTRO_WINDOW_LEN_S: u64 = 15 * 60;

/// Scan window for credits: last 10 minutes of each episode.
const CREDITS_WINDOW_LEN_S: u64 = 10 * 60;

/// Anything below this agreement (per [`Detection::agreement`]) is dropped.
const MIN_AGREEMENT: f32 = 0.4;

// Length sanity gates. A detection outside these is almost always a bad match.
const INTRO_MIN_MS: u64 = 8_000;
const INTRO_MAX_MS: u64 = 180_000;
const CREDITS_MIN_MS: u64 = 15_000;
const CREDITS_MAX_MS: u64 = 8 * 60_000;
const CREDITS_REFINE_LOOKBACK_MS: u64 = 6 * 60_000;
const CREDITS_MAX_MOVIE_MS: u64 = 10 * 60_000;

const INTRO_MAX_BRUTE_SHIFT: i64 = 4200;
const CREDITS_MAX_BRUTE_SHIFT: i64 = 600;

pub struct CancelFlag(pub Arc<AtomicBool>);

impl CancelFlag {
    pub fn new() -> Self {
        Self(Arc::new(AtomicBool::new(false)))
    }
    pub fn cancel(&self) {
        self.0.store(true, Ordering::SeqCst);
    }
    pub fn is_cancelled(&self) -> bool {
        self.0.load(Ordering::SeqCst)
    }
    pub fn clone_inner(&self) -> Arc<AtomicBool> {
        self.0.clone()
    }
}

impl Default for CancelFlag {
    fn default() -> Self {
        Self::new()
    }
}

fn emit(sink: &dyn ProgressSink, ev: &ProgressEvent) {
    sink.emit(ev);
}

/// Walks the show list. Returns the cumulative list of episodes that ended up
/// with at least one detected marker, ready to ship to the submit endpoint.
pub async fn analyze(
    runner: Arc<dyn MediaRunner>,
    sink: Arc<dyn ProgressSink>,
    shows: Vec<ShowInput>,
    cancel: Arc<AtomicBool>,
) -> Result<Vec<EpisodeResult>, String> {
    let total_episodes: usize = shows
        .iter()
        .flat_map(|s| s.seasons.iter())
        .flat_map(|s| &s.episodes)
        .count();
    emit(
        sink.as_ref(),
        &ProgressEvent::Started {
            total_shows: shows.len(),
            total_episodes,
        },
    );

    let mut results: Vec<EpisodeResult> = Vec::new();

    for (show_idx, show) in shows.iter().enumerate() {
        if cancel.load(Ordering::SeqCst) {
            break;
        }
        let (provider, provider_id) = match pick_external_id(&show.external_ids) {
            Some(p) => p,
            None => {
                tracing::info!("skipping {}: no tmdb/tvdb/imdb id", show.title);
                continue;
            }
        };

        emit(
            sink.as_ref(),
            &ProgressEvent::Show {
                index: show_idx,
                title: show.title.clone(),
                season_count: show.seasons.len(),
            },
        );

        let mut show_results = 0usize;

        // Movies have no sibling episodes to fingerprint against — they get the
        // chapter/black-frame detector instead of the cross-episode aligner.
        if show.kind == MediaKind::Movie {
            if let Some(er) = process_movie(&runner, &sink, show, &provider, &provider_id).await {
                show_results += 1;
                results.push(er);
            }
            emit(
                sink.as_ref(),
                &ProgressEvent::ShowFinished {
                    title: show.title.clone(),
                    episode_results: show_results,
                },
            );
            continue;
        }

        for season in &show.seasons {
            if cancel.load(Ordering::SeqCst) {
                break;
            }
            let (intro_detections, credits_detections) =
                process_season(&runner, &sink, &show.title, season, cancel.clone()).await;

            // Each episode keeps its OWN markers — these are per-episode facts.
            for (ep_idx, ep) in season.episodes.iter().enumerate() {
                if cancel.load(Ordering::SeqCst) {
                    break;
                }
                let mut markers: Vec<DetectedMarker> = Vec::new();

                if let Some(d) = &intro_detections[ep_idx] {
                    let span = d.end_ms.saturating_sub(d.start_ms);
                    if d.agreement >= MIN_AGREEMENT && (INTRO_MIN_MS..=INTRO_MAX_MS).contains(&span)
                    {
                        markers.push(DetectedMarker {
                            marker_type: MarkerType::Intro,
                            start_ms: d.start_ms,
                            end_ms: d.end_ms,
                        });
                    }
                }

                // Credits: cross-episode fingerprint first (absolute time).
                let mut credits: Option<(u64, u64)> = None;
                if let Some(d) = &credits_detections[ep_idx] {
                    let span = d.end_ms.saturating_sub(d.start_ms);
                    if d.agreement >= MIN_AGREEMENT
                        && (CREDITS_MIN_MS..=CREDITS_MAX_MS).contains(&span)
                    {
                        let off = ep.duration_ms.saturating_sub(CREDITS_WINDOW_LEN_S * 1000);
                        let fp_start = off + d.start_ms;
                        let fp_end = off + d.end_ms;
                        // The recurring end-theme fingerprinting locks onto often starts
                        // well AFTER the credits visually begin. Pull the start back to the
                        // fade-to-black that cuts into the credit roll, when one sits close.
                        let search_start = fp_start.saturating_sub(CREDITS_REFINE_LOOKBACK_MS);
                        let start = match find_credits_fade_in_range(
                            runner.as_ref(),
                            &ep.stream_url,
                            ep.headers.as_ref(),
                            search_start,
                            fp_start,
                        )
                        .await
                        {
                            Some(fade) if fade < fp_start => fade,
                            _ => fp_start,
                        };
                        credits = Some((start, fp_end));
                    }
                }
                // Fallback: shows like GoT reuse no credits music across episodes,
                // so fingerprinting finds nothing — detect the fade-to-black instead.
                if credits.is_none() {
                    if let Some(span) = detect_credits_blackframe(
                        runner.as_ref(),
                        &ep.stream_url,
                        ep.headers.as_ref(),
                        ep.duration_ms,
                    )
                    .await
                    {
                        let len = span.end_ms.saturating_sub(span.start_ms);
                        if (CREDITS_MIN_MS..=CREDITS_MAX_MOVIE_MS).contains(&len) {
                            credits = Some((span.start_ms, span.end_ms));
                        }
                    }
                }
                if let Some((s, e)) = credits {
                    markers.push(DetectedMarker {
                        marker_type: MarkerType::Credits,
                        start_ms: s,
                        end_ms: e,
                    });
                }

                let intro_ms = markers
                    .iter()
                    .find(|m| matches!(m.marker_type, MarkerType::Intro))
                    .map(|m| (m.start_ms, m.end_ms));
                let credits_ms = markers
                    .iter()
                    .find(|m| matches!(m.marker_type, MarkerType::Credits))
                    .map(|m| (m.start_ms, m.end_ms));
                emit(
                    sink.as_ref(),
                    &ProgressEvent::EpisodeMarkers {
                        show_title: show.title.clone(),
                        season_number: ep.season,
                        episode_number: ep.episode,
                        intro_ms,
                        credits_ms,
                    },
                );

                if !markers.is_empty() {
                    show_results += 1;
                    results.push(EpisodeResult {
                        episode_id: ep.id.clone(),
                        provider: provider.clone(),
                        provider_id: provider_id.clone(),
                        season: Some(ep.season),
                        episode: Some(ep.episode),
                        duration_ms: ep.duration_ms,
                        markers,
                    });
                }
            }
        }

        emit(
            sink.as_ref(),
            &ProgressEvent::ShowFinished {
                title: show.title.clone(),
                episode_results: show_results,
            },
        );
    }

    emit(
        sink.as_ref(),
        &ProgressEvent::Finished {
            total_episodes_marked: results.len(),
        },
    );
    Ok(results)
}

async fn process_season(
    runner: &Arc<dyn MediaRunner>,
    sink: &Arc<dyn ProgressSink>,
    show_title: &str,
    season: &SeasonInput,
    cancel: Arc<AtomicBool>,
) -> (Vec<Option<Detection>>, Vec<Option<Detection>>) {
    emit(
        sink.as_ref(),
        &ProgressEvent::Season {
            show_title: show_title.into(),
            season_number: season.season_number,
            episode_count: season.episodes.len(),
        },
    );

    if season.episodes.len() < 2 {
        // Need >= 2 episodes for fingerprint alignment to mean anything.
        return (
            vec![None; season.episodes.len()],
            vec![None; season.episodes.len()],
        );
    }

    let concurrency = 2; // Process up to 2 episodes concurrently

    let results: Vec<_> = stream::iter(season.episodes.clone())
        .map(|ep| {
            let runner = runner.clone();
            let sink = sink.clone();
            let cancel = cancel.clone();
            let title = show_title.to_string();

            async move {
                if cancel.load(Ordering::SeqCst) {
                    return None;
                }

                let duration_s = ep.duration_ms / 1000;
                let credits_len_s = CREDITS_WINDOW_LEN_S;
                let has_credits = duration_s > credits_len_s + 10;
                let tail_start_s = duration_s.saturating_sub(credits_len_s);

                emit(
                    sink.as_ref(),
                    &ProgressEvent::Episode {
                        show_title: title.clone(),
                        season_number: ep.season,
                        episode_number: ep.episode,
                        stage: EpisodeStage::Decoding,
                    },
                );

                // Run intro and credits extraction in parallel for the same episode
                let intro_fut = fingerprint_one(
                    runner.as_ref(),
                    &ep,
                    INTRO_WINDOW_START_S,
                    INTRO_WINDOW_LEN_S,
                );

                let (intro_res, credits_res_opt) = if has_credits {
                    let credits_fut =
                        fingerprint_one(runner.as_ref(), &ep, tail_start_s, credits_len_s);
                    let (intro_res, credits_res) = tokio::join!(intro_fut, credits_fut);
                    (intro_res, Some(credits_res))
                } else {
                    let intro_res = intro_fut.await;
                    (intro_res, None)
                };

                emit(
                    sink.as_ref(),
                    &ProgressEvent::Episode {
                        show_title: title.clone(),
                        season_number: ep.season,
                        episode_number: ep.episode,
                        stage: EpisodeStage::Done,
                    },
                );

                Some((ep.id.clone(), intro_res, credits_res_opt))
            }
        })
        .buffered(concurrency)
        .collect()
        .await;

    let mut intro_fps: Vec<Option<Fingerprint>> = Vec::with_capacity(season.episodes.len());
    let mut credits_fps: Vec<Option<Fingerprint>> = Vec::with_capacity(season.episodes.len());

    for res in results {
        match res {
            Some((ep_id, intro_res, credits_res_opt)) => {
                match intro_res {
                    Ok(fp) => intro_fps.push(Some(fp)),
                    Err(e) => {
                        tracing::warn!("episode {} intro fingerprint failed: {e}", ep_id);
                        intro_fps.push(None);
                    }
                }

                if let Some(c_res) = credits_res_opt {
                    match c_res {
                        Ok(fp) => credits_fps.push(Some(fp)),
                        Err(e) => {
                            tracing::warn!("episode {} credits fingerprint failed: {e}", ep_id);
                            credits_fps.push(None);
                        }
                    }
                } else {
                    credits_fps.push(None);
                }
            }
            None => {
                intro_fps.push(None);
                credits_fps.push(None);
            }
        }
    }

    // Intros can sit far apart between episodes; allow a wide fallback search.
    // Credits always live at the end of the tail window; keep that search narrow.
    let intro_detections = detect_markers(&intro_fps, INTRO_MAX_BRUTE_SHIFT);
    let credits_detections = detect_markers(&credits_fps, CREDITS_MAX_BRUTE_SHIFT);

    (intro_detections, credits_detections)
}

/// Detects markers for a single movie file (shipped as a one-season,
/// one-episode [`ShowInput`]). Tries embedded chapters first, then falls back to
/// black-frame credits detection. Returns `None` when nothing credible is found.
pub(crate) async fn process_movie(
    runner: &Arc<dyn MediaRunner>,
    sink: &Arc<dyn ProgressSink>,
    show: &ShowInput,
    provider: &str,
    provider_id: &str,
) -> Option<EpisodeResult> {
    let ep = show.seasons.first()?.episodes.first()?;
    let headers = ep.headers.as_ref();

    emit(
        sink.as_ref(),
        &ProgressEvent::Episode {
            show_title: show.title.clone(),
            season_number: 0,
            episode_number: 0,
            stage: EpisodeStage::Decoding,
        },
    );

    // 1. Authored chapters beat anything we can guess.
    let chapters = read_chapters(runner.as_ref(), &ep.stream_url, headers).await;

    let mut markers: Vec<DetectedMarker> = Vec::new();
    if let Some(intro) = chapters.intro {
        markers.push(DetectedMarker {
            marker_type: MarkerType::Intro,
            start_ms: intro.start_ms,
            end_ms: intro.end_ms,
        });
    }

    // 2. Credits: chapter if present, else fade-to-black detection.
    let credits = match chapters.credits {
        Some(c) => Some(c),
        None => {
            detect_credits_blackframe(runner.as_ref(), &ep.stream_url, headers, ep.duration_ms)
                .await
        }
    };
    if let Some(c) = credits {
        let span = c.end_ms.saturating_sub(c.start_ms);
        if (CREDITS_MIN_MS..=CREDITS_MAX_MOVIE_MS).contains(&span) {
            markers.push(DetectedMarker {
                marker_type: MarkerType::Credits,
                start_ms: c.start_ms,
                end_ms: c.end_ms,
            });
        }
    }

    emit(
        sink.as_ref(),
        &ProgressEvent::Episode {
            show_title: show.title.clone(),
            season_number: 0,
            episode_number: 0,
            stage: EpisodeStage::Done,
        },
    );
    emit(
        sink.as_ref(),
        &ProgressEvent::EpisodeMarkers {
            show_title: show.title.clone(),
            season_number: 0,
            episode_number: 0,
            intro_ms: markers
                .iter()
                .find(|m| matches!(m.marker_type, MarkerType::Intro))
                .map(|m| (m.start_ms, m.end_ms)),
            credits_ms: markers
                .iter()
                .find(|m| matches!(m.marker_type, MarkerType::Credits))
                .map(|m| (m.start_ms, m.end_ms)),
        },
    );

    if markers.is_empty() {
        return None;
    }
    Some(EpisodeResult {
        episode_id: ep.id.clone(),
        provider: provider.to_string(),
        provider_id: provider_id.to_string(),
        season: None,
        episode: None,
        duration_ms: ep.duration_ms,
        markers,
    })
}

async fn fingerprint_one(
    runner: &dyn MediaRunner,
    ep: &EpisodeInput,
    start_s: u64,
    len_s: u64,
) -> Result<Fingerprint, String> {
    let pcm =
        extract_pcm_window(runner, &ep.stream_url, ep.headers.as_ref(), start_s, len_s).await?;
    let result = fingerprint_pcm(runner, &pcm, len_s as u32).await;
    cleanup_pcm(&pcm);

    let fp = result?;
    Ok(fp)
}

/// `tmdb://1399` → ("tmdb", "1399"). Picks tmdb > tvdb > imdb when multiple
/// are present so we match the priority the TV client uses on read.
pub(crate) fn pick_external_id(ids: &[String]) -> Option<(String, String)> {
    fn parse(uri: &str) -> Option<(String, String)> {
        let idx = uri.find("://")?;
        let provider = uri[..idx].to_ascii_lowercase();
        let id = uri[idx + 3..].trim().to_string();
        if id.is_empty() {
            None
        } else if matches!(provider.as_str(), "tmdb" | "tvdb" | "imdb") {
            Some((provider, id))
        } else {
            None
        }
    }
    let parsed: Vec<(String, String)> = ids.iter().filter_map(|s| parse(s)).collect();
    parsed
        .iter()
        .find(|(p, _)| p == "tmdb")
        .cloned()
        .or_else(|| parsed.iter().find(|(p, _)| p == "tvdb").cloned())
        .or_else(|| parsed.iter().find(|(p, _)| p == "imdb").cloned())
}

#[cfg(test)]
mod tests {
    use super::pick_external_id;

    fn ids(list: &[&str]) -> Vec<String> {
        list.iter().map(|s| s.to_string()).collect()
    }

    #[test]
    fn prefers_tmdb_then_tvdb_then_imdb() {
        assert_eq!(
            pick_external_id(&ids(&["imdb://tt1", "tvdb://5", "tmdb://9"])),
            Some(("tmdb".into(), "9".into()))
        );
        assert_eq!(
            pick_external_id(&ids(&["imdb://tt1", "tvdb://5"])),
            Some(("tvdb".into(), "5".into()))
        );
        assert_eq!(
            pick_external_id(&ids(&["imdb://tt1"])),
            Some(("imdb".into(), "tt1".into()))
        );
    }

    #[test]
    fn rejects_unknown_provider_and_empty_id() {
        assert_eq!(pick_external_id(&ids(&["plex://abc"])), None);
        assert_eq!(pick_external_id(&ids(&["tmdb://"])), None);
        assert_eq!(pick_external_id(&ids(&[])), None);
    }
}
