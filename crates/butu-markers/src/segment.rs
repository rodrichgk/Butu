//! Single-file / fallback marker detection via ffmpeg video analysis.
//!
//! Cross-episode audio fingerprinting (see [`crate::detect`]) needs sibling
//! episodes to align against, which a movie doesn't have — and some TV shows
//! reuse no credits music, so fingerprinting finds nothing there either. Both
//! cases fall back to provider-agnostic video analysis:
//!
//!   1. **Embedded chapters** (cheapest). If the container ships a chapter named
//!      "Credits"/"Intro"/etc., trust it — it's authored, not guessed.
//!   2. **Black-frame detection** (fallback). The final scene fades to black and
//!      the credits roll to EOF; the last fade-to-black with a credits-length
//!      tail after it is the credits start.
//!   3. **Fade refine.** Pulls a fingerprint-detected credits start back to where
//!      the credits *visually* begin, via per-second luma sampling.

use std::collections::HashMap;

use crate::runner::MediaRunner;

/// A detected (start, end) interval in ms within the file.
#[derive(Debug, Clone, Copy)]
pub struct Span {
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Debug, Clone, Copy, Default)]
pub struct ChapterMarkers {
    pub intro: Option<Span>,
    pub credits: Option<Span>,
}

/// Credits must roll for at least this long after the fade for a black segment
/// to be a believable credits start (filters trailing fade-outs at EOF).
const CREDITS_MIN_REMAINING_MS: u64 = 45_000;
/// …and at most this long, so a mid-film fade isn't mistaken for credits
/// (also the submit endpoint's hard cap on a credits span).
const CREDITS_MAX_REMAINING_MS: u64 = 10 * 60_000;

fn build_header_arg(headers: Option<&HashMap<String, String>>) -> Option<String> {
    headers
        .map(|h| {
            h.iter()
                .map(|(k, v)| format!("{k}: {v}\r\n"))
                .collect::<String>()
        })
        .filter(|s| !s.is_empty())
}

/// Runs ffmpeg with `args`, returning (stdout, stderr) on a zero exit code.
async fn run_ffmpeg(
    runner: &dyn MediaRunner,
    args: Vec<String>,
) -> Result<(Vec<u8>, String), String> {
    let out = runner.ffmpeg(&args).await?;
    if out.code != 0 {
        return Err(format!(
            "ffmpeg exited with code {}: {}",
            out.code,
            out.stderr.chars().rev().take(500).collect::<String>()
        ));
    }
    Ok((out.stdout, out.stderr))
}

// ─── Chapters ────────────────────────────────────────────────────────────────

/// Reads embedded chapters via the `ffmetadata` muxer and maps any whose title
/// looks like an intro or credits chapter to a [`Span`]. Best-effort: any parse
/// failure just yields an empty result so the caller falls back to blackdetect.
pub async fn read_chapters(
    runner: &dyn MediaRunner,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
) -> ChapterMarkers {
    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-nostdin".into(),
    ];
    if let Some(h) = build_header_arg(headers) {
        args.push("-headers".into());
        args.push(h);
    }
    args.extend([
        "-i".into(),
        stream_url.to_string(),
        "-f".into(),
        "ffmetadata".into(),
        "-".into(),
    ]);

    let (stdout, _) = match run_ffmpeg(runner, args).await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("read_chapters ffmetadata failed: {e}");
            return ChapterMarkers::default();
        }
    };

    parse_ffmetadata_chapters(&String::from_utf8_lossy(&stdout))
}

fn parse_ffmetadata_chapters(text: &str) -> ChapterMarkers {
    let mut out = ChapterMarkers::default();

    // Accumulate fields for the chapter currently being parsed.
    let mut timebase: Option<(u64, u64)> = None;
    let mut start: Option<u64> = None;
    let mut end: Option<u64> = None;
    let mut title: Option<String> = None;
    let mut in_chapter = false;

    let flush = |out: &mut ChapterMarkers,
                 tb: &Option<(u64, u64)>,
                 s: &Option<u64>,
                 e: &Option<u64>,
                 t: &Option<String>| {
        let (Some((num, den)), Some(s), Some(e), Some(t)) = (tb, s, e, t) else {
            return;
        };
        if *den == 0 {
            return;
        }
        let to_ms = |v: u64| (v as f64 * (*num as f64) / (*den as f64) * 1000.0) as u64;
        let span = Span {
            start_ms: to_ms(*s),
            end_ms: to_ms(*e),
        };
        if span.end_ms <= span.start_ms {
            return;
        }
        let lt = t.to_ascii_lowercase();
        if out.credits.is_none()
            && (lt.contains("credit") || lt.contains("outro") || lt.contains("end title"))
        {
            out.credits = Some(span);
        } else if out.intro.is_none()
            && (lt.contains("intro")
                || lt.contains("opening")
                || lt.contains("recap")
                || lt.contains("previously")
                || lt.contains("title sequence"))
        {
            out.intro = Some(span);
        }
    };

    for line in text.lines() {
        let line = line.trim();
        if line.eq_ignore_ascii_case("[CHAPTER]") {
            if in_chapter {
                flush(&mut out, &timebase, &start, &end, &title);
            }
            in_chapter = true;
            timebase = None;
            start = None;
            end = None;
            title = None;
            continue;
        }
        if line.starts_with('[') {
            // A non-chapter section (e.g. [STREAM]) ends chapter parsing.
            if in_chapter {
                flush(&mut out, &timebase, &start, &end, &title);
                in_chapter = false;
            }
            continue;
        }
        if !in_chapter {
            continue;
        }
        if let Some(v) = line.strip_prefix("TIMEBASE=") {
            let mut it = v.split('/');
            if let (Some(n), Some(d)) = (it.next(), it.next()) {
                if let (Ok(n), Ok(d)) = (n.trim().parse::<u64>(), d.trim().parse::<u64>()) {
                    timebase = Some((n, d));
                }
            }
        } else if let Some(v) = line.strip_prefix("START=") {
            start = v.trim().parse::<u64>().ok();
        } else if let Some(v) = line.strip_prefix("END=") {
            end = v.trim().parse::<u64>().ok();
        } else if let Some(v) = line.strip_prefix("title=") {
            title = Some(v.to_string());
        }
    }
    if in_chapter {
        flush(&mut out, &timebase, &start, &end, &title);
    }

    out
}

// ─── Black-frame credits detection ───────────────────────────────────────────

/// Scans the tail of a movie for the fade-to-black that precedes the credit
/// roll. Returns the (credits_start, EOF) span, or `None` if nothing credible.
pub async fn detect_credits_blackframe(
    runner: &dyn MediaRunner,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    duration_ms: u64,
) -> Option<Span> {
    // Scan the last ~quarter, clamped to [8 min, 20 min].
    let duration_s = duration_ms / 1000;
    let tail_len_s = (duration_s / 4).clamp(8 * 60, 20 * 60).min(duration_s);
    blackframe_scan(
        runner,
        stream_url,
        headers,
        duration_ms,
        tail_len_s,
        true,
        "blackdetect",
    )
    .await
}

/// How far back from EOF the *fast* TV path scans for the credits fade. Episodic
/// credits sit at the very tail (a few minutes), unlike a movie's long roll, so a
/// tight window means far less video to decode than the 8–20 min movie scan.
const FAST_TV_BLACKFRAME_TAIL_S: u64 = 6 * 60;

/// Fast-pipeline TV credits fallback: like [`detect_credits_blackframe`] but scans
/// only the last [`FAST_TV_BLACKFRAME_TAIL_S`] and drops `-hwaccel auto` (which,
/// around a tiny `scale`+`blackdetect` CPU filter, only adds GPU upload/download —
/// measured ~4.8× SLOWER on 1080p10 HEVC). Used when cross-episode fingerprinting
/// finds no recurring end-theme (e.g. GoT).
pub async fn detect_credits_blackframe_tv(
    runner: &dyn MediaRunner,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    duration_ms: u64,
) -> Option<Span> {
    let duration_s = duration_ms / 1000;
    let tail_len_s = FAST_TV_BLACKFRAME_TAIL_S.min(duration_s);
    blackframe_scan(
        runner,
        stream_url,
        headers,
        duration_ms,
        tail_len_s,
        false,
        "blackdetect (fast tv)",
    )
    .await
}

/// Shared black-frame scan: decode `tail_len_s` of video ending at EOF, run
/// blackdetect, and return the latest fade that leaves a credits-length tail.
async fn blackframe_scan(
    runner: &dyn MediaRunner,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    duration_ms: u64,
    tail_len_s: u64,
    hwaccel: bool,
    log_label: &str,
) -> Option<Span> {
    if duration_ms < CREDITS_MIN_REMAINING_MS * 2 {
        return None;
    }
    let duration_s = duration_ms / 1000;
    let tail_start_s = duration_s.saturating_sub(tail_len_s);
    let tail_start_ms = tail_start_s * 1000;

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "info".into(), // blackdetect reports at info level
        "-nostdin".into(),
    ];
    if hwaccel {
        args.push("-hwaccel".into());
        args.push("auto".into());
    }
    args.push("-ss".into());
    args.push(tail_start_s.to_string());
    if let Some(h) = build_header_arg(headers) {
        args.push("-headers".into());
        args.push(h);
    }
    args.extend([
        "-i".into(),
        stream_url.to_string(),
        "-t".into(),
        tail_len_s.to_string(),
        "-an".into(),
        // Downscale before blackdetect so the pixel averaging is cheap.
        "-vf".into(),
        "scale=160:90,blackdetect=d=0.3:pix_th=0.10".into(),
        "-f".into(),
        "null".into(),
        "-".into(),
    ]);

    let (_, stderr) = match run_ffmpeg(runner, args).await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("{log_label} failed: {e}");
            return None;
        }
    };

    // Black segment end timestamps (absolute ms), ascending.
    let mut black_ends_ms: Vec<u64> = parse_black_ends(&stderr)
        .into_iter()
        .map(|rel_s| tail_start_ms + (rel_s * 1000.0) as u64)
        .collect();
    black_ends_ms.sort_unstable();

    // Walk fades latest-first; the last one leaving a credits-length tail is the
    // fade into the credit roll. (Earlier qualifying fades are scene cuts; later
    // ones with too little tail are the final fade-out.)
    for &end_ms in black_ends_ms.iter().rev() {
        let remaining = duration_ms.saturating_sub(end_ms);
        if end_ms > duration_ms / 2
            && (CREDITS_MIN_REMAINING_MS..=CREDITS_MAX_REMAINING_MS).contains(&remaining)
        {
            return Some(Span {
                start_ms: end_ms,
                end_ms: duration_ms,
            });
        }
    }
    None
}

/// Luma (0–255) at/below this is the deep black the credit-roll background sits at
/// (letterbox + black card). Footage — and even a dim final scene (~20–25) — reads
/// higher; only the credit fade-in drops this low, so it anchors the roll start.
const CREDIT_DEEP_LUMA: f64 = 20.0;
/// Frames per second sampled for the credit-start scan (0.5 s resolution).
const CREDIT_SCAN_FPS: u32 = 2;
/// A deep-black run must last at least this many sampled frames (~3 s) to count as
/// the credit fade-in — filters brief dark blips inside footage or a montage.
const CREDIT_MIN_DEEP_FRAMES: usize = 6;
/// Bridge this many bright frames inside a deep run (a name/logo flashing white).
const CREDIT_DEEP_BRIDGE: usize = 1;
/// A real credit fade-in bottoms out at the letterbox/black-card level (~15). A
/// dark *scene* stays higher (~18–25), so a qualifying run must reach this deep —
/// this is what separates the credits from a dark final scene.
const CREDIT_VERY_DEEP_LUMA: f64 = 16.5;

/// Finds where the visual credit roll begins, scanning a window just before the
/// recurring end-theme (`theme_start_ms`). On many shows the credits roll over a
/// unique-per-episode song for ~1 min *before* the recurring theme the fingerprint
/// locks onto, so the theme start is a reliable but LATE credits mark. The real
/// start is where sustained darkness (the credit roll) begins.
///
/// We sample per-frame luma over the window and walk BACK from the theme through
/// the dark credit roll (tolerating a brief bright card) until sustained footage.
/// A dark *scene* earlier in the episode is excluded because real footage sits
/// between it and the credits and stops the walk-back. Returns the credit-roll
/// start, or `None` when no dark roll of a plausible length sits before the theme
/// (caller then keeps the reliable theme start — the "earliest reliable" hybrid).
pub async fn find_credits_fade_before(
    runner: &dyn MediaRunner,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    theme_start_ms: u64,
    max_song_ms: u64,
    min_song_ms: u64,
) -> Option<u64> {
    let scan_start_ms = theme_start_ms.saturating_sub(max_song_ms + 5_000);
    let start_s = scan_start_ms / 1000;
    let len_s = theme_start_ms.saturating_sub(scan_start_ms) / 1000;
    if len_s < 20 {
        return None;
    }

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-nostdin".into(),
        "-ss".into(),
        start_s.to_string(),
    ];
    if let Some(h) = build_header_arg(headers) {
        args.push("-headers".into());
        args.push(h);
    }
    args.extend([
        "-i".into(),
        stream_url.to_string(),
        "-t".into(),
        len_s.to_string(),
        "-an".into(),
        "-vf".into(),
        format!("fps={CREDIT_SCAN_FPS},scale=64:36,signalstats,metadata=print:file=-"),
        "-f".into(),
        "null".into(),
        "-".into(),
    ]);

    let (stdout, _) = run_ffmpeg(runner, args).await.ok()?;
    let lumas = parse_yavg(&String::from_utf8_lossy(&stdout)); // (rel_s, luma)
    let n = lumas.len();
    if n < 10 {
        return None;
    }

    // The credit roll begins with a fade-in to deep black. On some shows the roll
    // then brightens (a photo montage over the song), so we do NOT require darkness
    // to be contiguous back to the theme. Instead find the longest deep-black run
    // whose start sits in the plausible window — that solid black block is the
    // fade-in at the roll's start, robust to whatever the credits do afterwards.
    let mut runs: Vec<(usize, usize)> = Vec::new(); // (start_idx, end_idx)
    let mut run_start: Option<usize> = None;
    let mut last_deep = 0usize;
    for k in 0..n {
        if lumas[k].1 <= CREDIT_DEEP_LUMA {
            if run_start.is_none() {
                run_start = Some(k);
            }
            last_deep = k;
        } else if let Some(s) = run_start {
            if k - last_deep > CREDIT_DEEP_BRIDGE {
                runs.push((s, last_deep));
                run_start = None;
            }
        }
    }
    if let Some(s) = run_start {
        runs.push((s, last_deep));
    }

    let lo_ms = theme_start_ms.saturating_sub(max_song_ms);
    let hi_ms = theme_start_ms.saturating_sub(min_song_ms);
    let deep = runs
        .into_iter()
        .filter(|&(s, e)| e + 1 - s >= CREDIT_MIN_DEEP_FRAMES)
        .filter(|&(s, e)| {
            lumas[s..=e]
                .iter()
                .any(|&(_, l)| l <= CREDIT_VERY_DEEP_LUMA)
        })
        .map(|(s, e)| (scan_start_ms + (lumas[s].0 * 1000.0) as u64, e + 1 - s))
        .filter(|&(sm, _)| (lo_ms..=hi_ms).contains(&sm))
        .max_by_key(|&(_, len)| len)
        .map(|(sm, _)| sm);
    if deep.is_some() {
        return deep;
    }

    // Fallback for bright/colored credits (e.g. Euphoria's ~68-luma background):
    // there's no deep black, but the footage→credits transition is still a big,
    // SUSTAINED luma step-down. Find the last such step whose tail stays low to the
    // theme — that's the credit-roll start.
    credit_step_down(&lumas, scan_start_ms, lo_ms, hi_ms)
}

/// Minimum footage→credits luma drop for the bright-credits fallback, the
/// averaging half-window (frames), and the fraction of the post-drop tail that
/// must stay below the footage level to accept it as the credit roll.
const CREDIT_STEP_MIN: f64 = 40.0;
const CREDIT_STEP_W: usize = 4;
const CREDIT_STEP_BELOW_FRAC: f64 = 0.8;

fn credit_step_down(
    lumas: &[(f64, f64)],
    scan_start_ms: u64,
    lo_ms: u64,
    hi_ms: u64,
) -> Option<u64> {
    let n = lumas.len();
    let w = CREDIT_STEP_W;
    if n < 2 * w + 1 {
        return None;
    }
    let mut best: Option<u64> = None;
    for k in w..(n - w) {
        let mb = lumas[k - w..k].iter().map(|&(_, l)| l).sum::<f64>() / w as f64;
        let ma = lumas[k..k + w].iter().map(|&(_, l)| l).sum::<f64>() / w as f64;
        if mb - ma < CREDIT_STEP_MIN {
            continue;
        }
        let sm = scan_start_ms + (lumas[k].0 * 1000.0) as u64;
        if !(lo_ms..=hi_ms).contains(&sm) {
            continue;
        }
        // The credit roll stays below the footage level from here to the theme; a
        // mere scene cut has footage return bright, failing this.
        let floor = mb - CREDIT_STEP_MIN * 0.5;
        let tail = &lumas[k..];
        let below = tail.iter().filter(|&&(_, l)| l < floor).count() as f64 / tail.len() as f64;
        if below >= CREDIT_STEP_BELOW_FRAC {
            best = Some(sm); // latest qualifying wins (k ascends)
        }
    }
    best
}

/// Average luma (0–255) above this is episode footage; credits (white text on
/// black, plus the odd coloured logo card) sit well below. Tuned on real episodes.
const FOOTAGE_LUMA: f64 = 34.0;
/// Tolerate a brighter credit card / logo up to this many frames (@ 1 fps) while
/// walking back through the credits — a longer bright run is real footage.
const CARD_TOLERANCE_FRAMES: usize = 20;
/// Moving-average window (frames @ 1 fps) to absorb single-frame luma spikes.
const LUMA_SMOOTH: usize = 7;
/// Ignore a pull-back shorter than this — credits already start ~at the theme.
const MIN_PULLBACK_MS: u64 = 20_000;
/// …and never pull back more than this. A dark *scene* that merges straight into
/// the credits (no footage gap) walks back too far; capping it keeps the safe,
/// late theme start instead of firing Up-Next during the actual episode.
const MAX_PULLBACK_MS: u64 = 200_000;

/// Refines a fingerprint-detected credits start back to where the credits
/// VISUALLY begin. Cross-episode fingerprinting only locks onto the recurring end
/// *theme music*, which on shows like Stranger Things starts well after the credit
/// roll begins (over a unique-per-episode song). So we sample per-second luma over
/// `[search_start_ms, music_start_ms]` and walk BACK from the theme through the
/// dark credit roll (tolerating brief brighter credit cards) until we hit
/// sustained footage — that boundary is where the credits visually start.
///
/// Validated against real episodes + extracted frames: a dark *scene* before the
/// credits is excluded because real footage sits between it and the credits; and
/// when a dark scene merges straight into the credits with no footage gap, the
/// walk overshoots and the pull-back cap keeps the safe (late) theme start. Both
/// avoid a false-early Up-Next during the episode. Returns `None` to keep the
/// fingerprint start.
pub async fn find_credits_fade_in_range(
    runner: &dyn MediaRunner,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    search_start_ms: u64,
    music_start_ms: u64,
) -> Option<u64> {
    find_credits_fade_impl(
        runner,
        stream_url,
        headers,
        search_start_ms,
        music_start_ms,
        true,
    )
    .await
}

/// Fast-pipeline fade refine: identical to [`find_credits_fade_in_range`] but
/// without `-hwaccel auto`. Measured on real 1080p10 HEVC episodes, hwaccel
/// decodes this pass ~4.5× SLOWER — the GPU round-trip around the tiny CPU
/// `scale`+`signalstats` filter costs far more than it saves.
pub async fn find_credits_fade_in_range_fast(
    runner: &dyn MediaRunner,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    search_start_ms: u64,
    music_start_ms: u64,
) -> Option<u64> {
    find_credits_fade_impl(
        runner,
        stream_url,
        headers,
        search_start_ms,
        music_start_ms,
        false,
    )
    .await
}

async fn find_credits_fade_impl(
    runner: &dyn MediaRunner,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    search_start_ms: u64,
    music_start_ms: u64,
    hwaccel: bool,
) -> Option<u64> {
    if music_start_ms <= search_start_ms {
        return None;
    }
    let start_s = search_start_ms / 1000;
    let len_s = (music_start_ms - search_start_ms) / 1000;
    if len_s < 30 {
        return None;
    }

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "error".into(),
        "-nostdin".into(),
    ];
    if hwaccel {
        args.push("-hwaccel".into());
        args.push("auto".into());
    }
    args.push("-ss".into());
    args.push(start_s.to_string());
    if let Some(h) = build_header_arg(headers) {
        args.push("-headers".into());
        args.push(h);
    }
    args.extend([
        "-i".into(),
        stream_url.to_string(),
        "-t".into(),
        len_s.to_string(),
        "-an".into(),
        // 1 fps of average luma, printed to stdout. Tiny scale keeps it cheap.
        "-vf".into(),
        "fps=1,scale=64:36,signalstats,metadata=print:file=-".into(),
        "-f".into(),
        "null".into(),
        "-".into(),
    ]);

    let (stdout, _) = match run_ffmpeg(runner, args).await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("find_credits_fade_in_range pass failed: {e}");
            return None;
        }
    };

    // (time_s relative to ss, luma) per frame.
    let lumas = parse_yavg(&String::from_utf8_lossy(&stdout));
    if lumas.len() < 30 {
        return None;
    }

    // Smooth to absorb single-frame luma spikes.
    let n = lumas.len();
    let half = LUMA_SMOOTH / 2;
    let sm: Vec<f64> = (0..n)
        .map(|i| {
            let a = i.saturating_sub(half);
            let b = (i + half + 1).min(n);
            lumas[a..b].iter().map(|&(_, y)| y).sum::<f64>() / (b - a) as f64
        })
        .collect();

    // Walk back from the theme through the dark credits; a credit card (brief
    // bright run) is tolerated, sustained footage stops us. `boundary` tracks the
    // earliest dark frame reached — the footage→credits transition.
    let mut bright = 0usize;
    let mut boundary = n - 1;
    let mut i = n as isize - 1;
    while i >= 0 {
        let idx = i as usize;
        if sm[idx] < FOOTAGE_LUMA {
            bright = 0;
            boundary = idx;
        } else {
            bright += 1;
            if bright >= CARD_TOLERANCE_FRAMES {
                break;
            }
        }
        i -= 1;
    }

    let credits_start_ms = start_s * 1000 + (lumas[boundary].0 * 1000.0) as u64;
    let pullback = music_start_ms.saturating_sub(credits_start_ms);
    if (MIN_PULLBACK_MS..=MAX_PULLBACK_MS).contains(&pullback) {
        Some(credits_start_ms)
    } else {
        None
    }
}

/// Parses `metadata=print` output: pairs each `pts_time:<s>` with the following
/// `lavfi.signalstats.YAVG=<luma>` into (time_s, luma).
fn parse_yavg(stdout: &str) -> Vec<(f64, f64)> {
    let mut out = Vec::new();
    let mut t: Option<f64> = None;
    for line in stdout.lines() {
        let line = line.trim();
        if let Some(idx) = line.find("pts_time:") {
            let rest = &line[idx + "pts_time:".len()..];
            let tok: String = rest
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            t = tok.parse::<f64>().ok();
        } else if let Some(v) = line.strip_prefix("lavfi.signalstats.YAVG=") {
            if let (Some(time), Ok(y)) = (t, v.trim().parse::<f64>()) {
                out.push((time, y));
            }
        }
    }
    out
}

/// Pulls the `black_end:<secs>` value out of every blackdetect log line.
fn parse_black_ends(stderr: &str) -> Vec<f64> {
    let mut ends = Vec::new();
    for line in stderr.lines() {
        if let Some(idx) = line.find("black_end:") {
            let rest = &line[idx + "black_end:".len()..];
            let token: String = rest
                .chars()
                .take_while(|c| c.is_ascii_digit() || *c == '.')
                .collect();
            if let Ok(v) = token.parse::<f64>() {
                ends.push(v);
            }
        }
    }
    ends
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_blackdetect_ends() {
        let s = "[blackdetect @ 0x1] black_start:33.5 black_end:43.7 black_duration:10.2\n\
                 unrelated line\n\
                 [blackdetect @ 0x2] black_start:50.7 black_end:52.2 black_duration:1.5\n";
        assert_eq!(parse_black_ends(s), vec![43.7, 52.2]);
    }

    #[test]
    fn parses_yavg_time_luma_pairs() {
        let s = "frame:0  pts_time:2760.5\n\
                 lavfi.signalstats.YAVG=28.0\n\
                 frame:1  pts_time:2761.0\n\
                 lavfi.signalstats.YAVG=62.7\n";
        assert_eq!(parse_yavg(s), vec![(2760.5, 28.0), (2761.0, 62.7)]);
    }

    #[test]
    fn maps_intro_and_credits_chapters() {
        let s = "[CHAPTER]\nTIMEBASE=1/1000\nSTART=0\nEND=90000\ntitle=Intro\n\
                 [CHAPTER]\nTIMEBASE=1/1000\nSTART=3600000\nEND=3660000\ntitle=End Credits\n\
                 [CHAPTER]\nTIMEBASE=1/1000\nSTART=100000\nEND=200000\ntitle=Scene 2\n";
        let c = parse_ffmetadata_chapters(s);
        let intro = c.intro.expect("intro chapter");
        assert_eq!((intro.start_ms, intro.end_ms), (0, 90_000));
        let cr = c.credits.expect("credits chapter");
        assert_eq!((cr.start_ms, cr.end_ms), (3_600_000, 3_660_000));
    }

    #[test]
    fn step_down_finds_bright_credit_start() {
        // Footage at luma ~200 for 10 s (20 frames @ 2 fps), then a colored credit
        // roll at ~68 that stays low — the transition is the credit start.
        let mut lumas: Vec<(f64, f64)> = Vec::new();
        for i in 0..20 {
            lumas.push((i as f64 * 0.5, 200.0));
        }
        for i in 20..80 {
            lumas.push((i as f64 * 0.5, 68.0));
        }
        let scan_start_ms = 3_000_000; // window begins at 3000 s
        let got = credit_step_down(&lumas, scan_start_ms, 3_000_000, 3_080_000)
            .expect("step-down credit start");
        let rel_s = (got - scan_start_ms) as f64 / 1000.0;
        assert!(
            (rel_s - 10.0).abs() <= 2.0,
            "credit start at {rel_s}s, expected ~10s"
        );
    }

    #[test]
    fn step_down_ignores_a_brief_dip() {
        // Footage, a 1-frame dark blip, footage — no sustained credit roll.
        let mut lumas: Vec<(f64, f64)> = Vec::new();
        for i in 0..40 {
            let l = if i == 20 { 30.0 } else { 200.0 };
            lumas.push((i as f64 * 0.5, l));
        }
        assert_eq!(
            credit_step_down(&lumas, 3_000_000, 3_000_000, 3_080_000),
            None
        );
    }
}
