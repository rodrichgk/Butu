//! Single-file marker detection for movies.
//!
//! Cross-episode audio fingerprinting (see [`crate::analysis::detect`]) needs
//! sibling episodes to align against, which a movie doesn't have. So movies get
//! a different, provider-agnostic pipeline:
//!
//!   1. **Embedded chapters** (cheapest). If the container ships a chapter named
//!      "Credits"/"Intro"/etc., trust it — it's authored, not guessed.
//!   2. **Black-frame detection** (fallback). The final scene fades to black and
//!      the credits roll to EOF; the last fade-to-black with a credits-length
//!      tail after it is the credits start.
//!
//! Both shell out to the bundled `ffmpeg` sidecar.

use std::collections::HashMap;

use tauri::AppHandle;
use tauri_plugin_shell::process::CommandEvent;
use tauri_plugin_shell::ShellExt;

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

/// Runs the ffmpeg sidecar with `args`, returning (stdout, stderr_tail).
async fn run_ffmpeg(app: &AppHandle, args: Vec<String>) -> Result<(Vec<u8>, String), String> {
    let shell = app.shell();
    let cmd = shell
        .sidecar("ffmpeg")
        .map_err(|e| format!("ffmpeg sidecar not found: {e}"))?
        .args(&args);

    let (mut rx, _child) = cmd.spawn().map_err(|e| format!("ffmpeg spawn: {e}"))?;

    let mut stdout = Vec::new();
    let mut stderr = String::new();
    while let Some(event) = rx.recv().await {
        match event {
            CommandEvent::Stdout(bytes) => stdout.extend_from_slice(&bytes),
            CommandEvent::Stderr(bytes) => {
                // blackdetect logs to stderr; keep a generous tail.
                if stderr.len() < 200_000 {
                    stderr.push_str(&String::from_utf8_lossy(&bytes));
                }
            }
            CommandEvent::Terminated(payload) => {
                if payload.code.unwrap_or(1) != 0 {
                    return Err(format!(
                        "ffmpeg exited with code {:?}: {}",
                        payload.code,
                        stderr.chars().rev().take(500).collect::<String>()
                    ));
                }
                break;
            }
            _ => {}
        }
    }
    Ok((stdout, stderr))
}

// ─── Chapters ────────────────────────────────────────────────────────────────

/// Reads embedded chapters via the `ffmetadata` muxer and maps any whose title
/// looks like an intro or credits chapter to a [`Span`]. Best-effort: any parse
/// failure just yields an empty result so the caller falls back to blackdetect.
pub async fn read_chapters(
    app: &AppHandle,
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

    let (stdout, _) = match run_ffmpeg(app, args).await {
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
        let span = Span { start_ms: to_ms(*s), end_ms: to_ms(*e) };
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
    app: &AppHandle,
    stream_url: &str,
    headers: Option<&HashMap<String, String>>,
    duration_ms: u64,
) -> Option<Span> {
    if duration_ms < CREDITS_MIN_REMAINING_MS * 2 {
        return None;
    }
    let duration_s = duration_ms / 1000;

    // Scan the last ~quarter, clamped to [8 min, 20 min].
    let tail_len_s = (duration_s / 4).clamp(8 * 60, 20 * 60).min(duration_s);
    let tail_start_s = duration_s.saturating_sub(tail_len_s);
    let tail_start_ms = tail_start_s * 1000;

    let mut args: Vec<String> = vec![
        "-hide_banner".into(),
        "-loglevel".into(),
        "info".into(), // blackdetect reports at info level
        "-nostdin".into(),
        "-hwaccel".into(),
        "auto".into(),
        "-ss".into(),
        tail_start_s.to_string(),
    ];
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

    let (_, stderr) = match run_ffmpeg(app, args).await {
        Ok(v) => v,
        Err(e) => {
            tracing::warn!("blackdetect failed: {e}");
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
            && remaining >= CREDITS_MIN_REMAINING_MS
            && remaining <= CREDITS_MAX_REMAINING_MS
        {
            return Some(Span { start_ms: end_ms, end_ms: duration_ms });
        }
    }
    None
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
