//! Faster, remote-stream-optimized variant of the intro/credits detector.
//!
//! Kept ALONGSIDE the original [`crate::pipeline::analyze`] so the two can be
//! A/B'd on the same library. Same core primitives — audio→fpcalc fingerprint,
//! cross-episode alignment ([`detect_markers`]), black-frame credits — but four
//! structural changes cut wall-clock substantially, especially over the network:
//!
//!   1. **Concurrent Phase B.** The legacy pipeline runs the credits refinement
//!      (fade / black-frame ffmpeg passes) one episode at a time in a serial
//!      loop. Here the whole per-episode marker build runs `buffered(concurrency)`
//!      — the single biggest win for shows with no recurring credits music (every
//!      Game-of-Thrones episode falls back to a video-decoding black-frame scan).
//!   2. **Full intro window.** Real crowd-sourced markers show intros routinely
//!      start 7–9 min in (after a long cold open), so the intro is fingerprinted
//!      over the full 15 min — the audio decode is cheap next to Phase B.
//!   3. **TV-scoped black-frame fallback.** Scans the last 6 min, not 8–20.
//!   4. **Leaner decode.** Audio goes straight to 11025 Hz mono with `-vn` and no
//!      `-hwaccel` (see [`extract_pcm_window_fast`]).

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use futures_util::stream::{self, StreamExt};

use crate::audio::{cleanup_pcm, extract_pcm_window_fast, CHANNELS, SAMPLE_RATE_FAST};
use crate::detect::{detect_markers, Detection};
use crate::fingerprint::{fingerprint_pcm_rate, Fingerprint};
use crate::pipeline::{pick_external_id, process_movie};
use crate::progress::ProgressSink;
use crate::runner::MediaRunner;
use crate::segment::{detect_credits_blackframe_tv, find_credits_fade_before};
use crate::types::{
    DetectedMarker, EpisodeInput, EpisodeResult, EpisodeStage, MarkerType, MediaKind,
    ProgressEvent, SeasonInput, ShowInput,
};

/// Default number of episodes fingerprinted / refined at once.
///
/// This is a deliberate compromise. On a REMOTE stream each ffmpeg spends much of
/// its time waiting on HTTP range requests, so concurrency hides that latency and
/// higher is better. But the actual decode is software HEVC, which ffmpeg already
/// multi-threads internally — so on LOCAL/CPU-bound files, stacking several
/// decodes oversubscribes every core and can run *slower* than serial (measured).
/// 3 keeps a couple of streams in flight to hide network stalls without shredding
/// the CPU during decode bursts. Override per-call; on a fast LAN with many cores,
/// bump it up.
pub const DEFAULT_CONCURRENCY: usize = 3;

/// Intro scan window — same as the legacy pipeline. Real markers (IntroDB) show
/// intros commonly start 7–9 min in, so scanning only the first few minutes
/// misses them; the audio decode is cheap next to the video Phase-B passes.
const INTRO_FULL_LEN_S: u64 = 15 * 60;
const INTRO_WINDOW_START_S: u64 = 0;
/// Tail window fingerprinted for the recurring end-theme. Same as legacy.
const CREDITS_WINDOW_LEN_S: u64 = 10 * 60;

// ── Acceptance gates. Mirror the legacy pipeline so the two algorithms are
//    judged on the same span sanity rules; kept local so the fast path can be
//    tuned independently later. ──────────────────────────────────────────────
const MIN_AGREEMENT: f32 = 0.4;
/// Minimum intro length to emit. Real recurring intros run 20 s+; shows without a
/// recurring musical intro (procedurals, some HBO dramas) instead produce short
/// spurious cross-episode matches that pile up right at the detection floor
/// (~10–15 s) at wrong positions. Gating at 18 s suppresses that garbage — a
/// missing intro is far better than a wrong one — while keeping real intros.
/// (Validated: Stranger Things intros are 21–69 s; Euphoria/Lucifer false matches
/// are 10–15 s.)
const INTRO_MIN_MS: u64 = 18_000;
const INTRO_MAX_MS: u64 = 180_000;
const CREDITS_MIN_MS: u64 = 15_000;
const CREDITS_MAX_MS: u64 = 8 * 60_000;
/// How far before the recurring theme the visual credit roll may start (the
/// unique-song portion), and the minimum it must precede the theme by. Long
/// episodes (Stranger Things S4/S5) run ~2.5 min of unique-song credits before
/// the recurring theme, so the window has to be generous; the walk-back stops at
/// footage regardless, so over-scanning is safe.
const CREDITS_MAX_SONG_MS: u64 = 240_000;
const CREDITS_MIN_SONG_MS: u64 = 15_000;
const CREDITS_MAX_MOVIE_MS: u64 = 10 * 60_000;
const INTRO_MAX_BRUTE_SHIFT: i64 = 4200;
const CREDITS_MAX_BRUTE_SHIFT: i64 = 600;

fn emit(sink: &dyn ProgressSink, ev: &ProgressEvent) {
    sink.emit(ev);
}

/// True when a detection clears the same span/agreement gates the final marker
/// build uses. Used both to decide which episodes need the wide intro re-decode
/// and to gate the final intro marker.
fn intro_passes(d: &Detection) -> bool {
    let span = d.end_ms.saturating_sub(d.start_ms);
    d.agreement >= MIN_AGREEMENT && (INTRO_MIN_MS..=INTRO_MAX_MS).contains(&span)
}

/// Fast-pipeline entry point. Mirrors [`crate::pipeline::analyze`]'s contract:
/// returns every episode that ended up with ≥1 marker.
pub async fn analyze_fast(
    runner: Arc<dyn MediaRunner>,
    sink: Arc<dyn ProgressSink>,
    shows: Vec<ShowInput>,
    cancel: Arc<AtomicBool>,
    concurrency: usize,
) -> Result<Vec<EpisodeResult>, String> {
    let concurrency = concurrency.max(1);
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

        if show.kind == MediaKind::Movie {
            // Movies have no siblings to align against — reuse the legacy movie
            // path (chapters → black-frame) verbatim.
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
            let (intro_detections, credits_detections) = process_season_fast(
                &runner,
                &sink,
                &show.title,
                season,
                cancel.clone(),
                concurrency,
            )
            .await;

            let season_results = build_season_markers(
                &runner,
                &sink,
                show,
                season,
                &provider,
                &provider_id,
                &intro_detections,
                &credits_detections,
                cancel.clone(),
                concurrency,
            )
            .await;

            show_results += season_results.len();
            results.extend(season_results);
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

/// Phase A + adaptive intro. Fingerprints every episode's short intro window and
/// credits tail concurrently, runs detection, then re-decodes the wide intro
/// window only for episodes that didn't align, and re-runs intro detection once.
#[allow(clippy::too_many_arguments)]
async fn process_season_fast(
    runner: &Arc<dyn MediaRunner>,
    sink: &Arc<dyn ProgressSink>,
    show_title: &str,
    season: &SeasonInput,
    cancel: Arc<AtomicBool>,
    concurrency: usize,
) -> (Vec<Option<Detection>>, Vec<Option<Detection>>) {
    emit(
        sink.as_ref(),
        &ProgressEvent::Season {
            show_title: show_title.into(),
            season_number: season.season_number,
            episode_count: season.episodes.len(),
        },
    );

    let n = season.episodes.len();
    if n < 2 {
        // Need ≥2 episodes for fingerprint alignment to mean anything.
        return (vec![None; n], vec![None; n]);
    }

    // Phase A — decode short intro window + credits tail, fingerprint, concurrently.
    let title = show_title.to_string();
    let phase_a: Vec<(usize, Option<Fingerprint>, Option<Fingerprint>)> =
        stream::iter(season.episodes.iter().cloned().enumerate())
            .map(|(idx, ep)| {
                let runner = runner.clone();
                let sink = sink.clone();
                let cancel = cancel.clone();
                let title = title.clone();
                async move {
                    if cancel.load(Ordering::SeqCst) {
                        return (idx, None, None);
                    }
                    let duration_s = ep.duration_ms / 1000;
                    let has_credits = duration_s > CREDITS_WINDOW_LEN_S + 10;
                    let tail_start_s = duration_s.saturating_sub(CREDITS_WINDOW_LEN_S);

                    emit(
                        sink.as_ref(),
                        &ProgressEvent::Episode {
                            show_title: title.clone(),
                            season_number: ep.season,
                            episode_number: ep.episode,
                            stage: EpisodeStage::Decoding,
                        },
                    );

                    let intro_fut = fingerprint_window(
                        runner.as_ref(),
                        &ep,
                        INTRO_WINDOW_START_S,
                        INTRO_FULL_LEN_S,
                    );
                    let (intro_res, credits_res) = if has_credits {
                        let credits_fut = fingerprint_window(
                            runner.as_ref(),
                            &ep,
                            tail_start_s,
                            CREDITS_WINDOW_LEN_S,
                        );
                        let (i, c) = tokio::join!(intro_fut, credits_fut);
                        (i, Some(c))
                    } else {
                        (intro_fut.await, None)
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

                    let intro_fp = log_fp(intro_res, &ep, "intro");
                    let credits_fp = credits_res.and_then(|r| log_fp(r, &ep, "credits"));
                    (idx, intro_fp, credits_fp)
                }
            })
            .buffered(concurrency)
            .collect()
            .await;

    let mut intro_fps: Vec<Option<Fingerprint>> = (0..n).map(|_| None).collect();
    let mut credits_fps: Vec<Option<Fingerprint>> = (0..n).map(|_| None).collect();
    for (idx, i, c) in phase_a {
        intro_fps[idx] = i;
        credits_fps[idx] = c;
    }

    // Both markers detected on their full windows — same as legacy, so detection
    // parity holds; the fast pipeline's win comes entirely from the leaner decode
    // + concurrent Phase B, not from a narrower (and inaccurate) intro window.
    let intro_detections = detect_markers(&intro_fps, INTRO_MAX_BRUTE_SHIFT);
    let credits_detections = detect_markers(&credits_fps, CREDITS_MAX_BRUTE_SHIFT);
    (intro_detections, credits_detections)
}

/// Phase B — build each episode's markers concurrently. This is where the legacy
/// pipeline was serial; the credits fade-refine and black-frame fallback are the
/// video-decoding passes that dominate on shows without recurring credits music.
#[allow(clippy::too_many_arguments)]
async fn build_season_markers(
    runner: &Arc<dyn MediaRunner>,
    sink: &Arc<dyn ProgressSink>,
    show: &ShowInput,
    season: &SeasonInput,
    provider: &str,
    provider_id: &str,
    intro_detections: &[Option<Detection>],
    credits_detections: &[Option<Detection>],
    cancel: Arc<AtomicBool>,
    concurrency: usize,
) -> Vec<EpisodeResult> {
    let show_title = show.title.clone();
    let built: Vec<Option<EpisodeResult>> =
        stream::iter(season.episodes.iter().cloned().enumerate())
            .map(|(ep_idx, ep)| {
                let runner = runner.clone();
                let sink = sink.clone();
                let cancel = cancel.clone();
                let show_title = show_title.clone();
                let provider = provider.to_string();
                let provider_id = provider_id.to_string();
                let intro_det = intro_detections[ep_idx].clone();
                let credits_det = credits_detections[ep_idx].clone();
                async move {
                    if cancel.load(Ordering::SeqCst) {
                        return None;
                    }
                    let mut markers: Vec<DetectedMarker> = Vec::new();

                    if let Some(d) = &intro_det {
                        if intro_passes(d) {
                            markers.push(DetectedMarker {
                                marker_type: MarkerType::Intro,
                                start_ms: d.start_ms,
                                end_ms: d.end_ms,
                            });
                        }
                    }

                    // Credits: cross-episode fingerprint first (absolute time).
                    let mut credits: Option<(u64, u64)> = None;
                    if let Some(d) = &credits_det {
                        let span = d.end_ms.saturating_sub(d.start_ms);
                        if d.agreement >= MIN_AGREEMENT
                            && (CREDITS_MIN_MS..=CREDITS_MAX_MS).contains(&span)
                        {
                            let off = ep.duration_ms.saturating_sub(CREDITS_WINDOW_LEN_S * 1000);
                            let fp_start = off + d.start_ms;
                            let fp_end = off + d.end_ms;
                            // Hybrid: the recurring theme is a reliable but often
                            // LATE credits mark (credits roll over a unique song
                            // first). Pull the start back to the footage→credits
                            // fade-to-black when a clean one sits in range; else
                            // keep the reliable theme start.
                            let start = find_credits_fade_before(
                                runner.as_ref(),
                                &ep.stream_url,
                                ep.headers.as_ref(),
                                fp_start,
                                CREDITS_MAX_SONG_MS,
                                CREDITS_MIN_SONG_MS,
                            )
                            .await
                            .unwrap_or(fp_start);
                            credits = Some((start, fp_end));
                        }
                    }
                    // Fallback: shows that reuse no credits music across episodes
                    // (e.g. GoT) — detect the fade-to-black in the tail instead.
                    if credits.is_none() {
                        if let Some(span) = detect_credits_blackframe_tv(
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
                            show_title: show_title.clone(),
                            season_number: ep.season,
                            episode_number: ep.episode,
                            intro_ms,
                            credits_ms,
                        },
                    );

                    if markers.is_empty() {
                        return None;
                    }
                    Some(EpisodeResult {
                        episode_id: ep.id.clone(),
                        provider,
                        provider_id,
                        season: Some(ep.season),
                        episode: Some(ep.episode),
                        duration_ms: ep.duration_ms,
                        markers,
                    })
                }
            })
            .buffered(concurrency)
            .collect()
            .await;

    built.into_iter().flatten().collect()
}

/// Decode a window to 11025 Hz mono PCM and fingerprint it, cleaning up the temp
/// file. Any failure is surfaced as `Err` for the caller to log + drop.
async fn fingerprint_window(
    runner: &dyn MediaRunner,
    ep: &EpisodeInput,
    start_s: u64,
    len_s: u64,
) -> Result<Fingerprint, String> {
    let pcm = extract_pcm_window_fast(runner, &ep.stream_url, ep.headers.as_ref(), start_s, len_s)
        .await?;
    let result = fingerprint_pcm_rate(runner, &pcm, len_s as u32, SAMPLE_RATE_FAST, CHANNELS).await;
    cleanup_pcm(&pcm);
    result
}

/// Unwraps a fingerprint result, logging (not propagating) a failure so one bad
/// episode never sinks the season.
fn log_fp(res: Result<Fingerprint, String>, ep: &EpisodeInput, which: &str) -> Option<Fingerprint> {
    match res {
        Ok(fp) => Some(fp),
        Err(e) => {
            tracing::warn!("episode {} {which} fingerprint failed: {e}", ep.id);
            None
        }
    }
}
