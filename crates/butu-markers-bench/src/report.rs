//! Speed + accuracy reporting. Speed is wall-clock per (latency, algorithm).
//! Accuracy has two flavors: **parity** (fast vs legacy — is fast a safe
//! drop-in?) and, when a labels file is supplied, **absolute error** of each
//! algorithm against hand-labeled ground truth.

use std::collections::{BTreeMap, HashMap, HashSet};

use butu_markers::{EpisodeResult, MarkerType};
use serde::Deserialize;

use crate::scan::ScannedShow;

/// One (latency, algorithm) measurement.
pub struct Run {
    pub latency_ms: u64,
    pub bandwidth_mbps: Option<f64>,
    pub algo: String,
    pub elapsed_s: f64,
    pub episodes_marked: usize,
    pub results: Vec<EpisodeResult>,
}

fn marker_of(er: &EpisodeResult, mt: MarkerType) -> Option<(u64, u64)> {
    er.markers
        .iter()
        .find(|m| m.marker_type == mt)
        .map(|m| (m.start_ms, m.end_ms))
}

// ── Speed ─────────────────────────────────────────────────────────────────────

pub fn print_speed(runs: &[Run]) {
    println!("\n=== SPEED (wall-clock) ===");
    println!(
        "{:>9}  {:>10}  {:>9}  {:>9}  {:>8}",
        "latency", "bandwidth", "algo", "elapsed", "marked"
    );
    for r in runs {
        let bw = r
            .bandwidth_mbps
            .map(|b| format!("{b:.0} MB/s"))
            .unwrap_or_else(|| "∞".into());
        println!(
            "{:>7}ms  {:>10}  {:>9}  {:>8.1}s  {:>8}",
            r.latency_ms, bw, r.algo, r.elapsed_s, r.episodes_marked
        );
    }

    // Per-latency legacy/fast speedup, when both present.
    let mut by_lat: BTreeMap<u64, HashMap<String, f64>> = BTreeMap::new();
    for r in runs {
        by_lat
            .entry(r.latency_ms)
            .or_default()
            .insert(r.algo.clone(), r.elapsed_s);
    }
    println!("\n--- speedup (legacy ÷ fast) ---");
    for (lat, m) in &by_lat {
        if let (Some(l), Some(f)) = (m.get("legacy"), m.get("fast")) {
            let x = if *f > 0.0 { l / f } else { 0.0 };
            println!("  {lat:>5}ms latency:  legacy {l:.1}s → fast {f:.1}s   ({x:.1}× faster)");
        }
    }
}

// ── Parity (fast vs legacy) ───────────────────────────────────────────────────

pub struct ParityStat {
    pub marker: &'static str,
    pub both_agree: usize,
    pub both_disagree: usize,
    pub only_legacy: usize,
    pub only_fast: usize,
    pub neither: usize,
    pub mean_dstart: f64,
    pub mean_dend: f64,
    pub median_dstart: u64,
    pub median_dend: u64,
}

fn median(mut v: Vec<u64>) -> u64 {
    if v.is_empty() {
        return 0;
    }
    v.sort_unstable();
    v[v.len() / 2]
}

fn parity_for(
    marker: &'static str,
    mt: MarkerType,
    all_ids: &HashSet<String>,
    legacy: &HashMap<String, &EpisodeResult>,
    fast: &HashMap<String, &EpisodeResult>,
    tol_ms: u64,
) -> ParityStat {
    let (mut both_agree, mut both_disagree, mut only_legacy, mut only_fast, mut neither) =
        (0, 0, 0, 0, 0);
    let mut dstarts = Vec::new();
    let mut dends = Vec::new();

    for id in all_ids {
        let l = legacy.get(id).and_then(|er| marker_of(er, mt));
        let f = fast.get(id).and_then(|er| marker_of(er, mt));
        match (l, f) {
            (Some((ls, le)), Some((fs, fe))) => {
                let ds = ls.abs_diff(fs);
                let de = le.abs_diff(fe);
                dstarts.push(ds);
                dends.push(de);
                if ds <= tol_ms && de <= tol_ms {
                    both_agree += 1;
                } else {
                    both_disagree += 1;
                }
            }
            (Some(_), None) => only_legacy += 1,
            (None, Some(_)) => only_fast += 1,
            (None, None) => neither += 1,
        }
    }

    let mean = |v: &[u64]| {
        if v.is_empty() {
            0.0
        } else {
            v.iter().sum::<u64>() as f64 / v.len() as f64
        }
    };
    ParityStat {
        marker,
        both_agree,
        both_disagree,
        only_legacy,
        only_fast,
        neither,
        mean_dstart: mean(&dstarts),
        mean_dend: mean(&dends),
        median_dstart: median(dstarts),
        median_dend: median(dends),
    }
}

/// Compares the legacy and fast result sets. `all_ids` is every episode analyzed
/// (so "neither found a marker" can be counted).
pub fn parity(
    all_ids: &HashSet<String>,
    legacy: &[EpisodeResult],
    fast: &[EpisodeResult],
    tol_ms: u64,
) -> Vec<ParityStat> {
    let lmap: HashMap<String, &EpisodeResult> =
        legacy.iter().map(|e| (e.episode_id.clone(), e)).collect();
    let fmap: HashMap<String, &EpisodeResult> =
        fast.iter().map(|e| (e.episode_id.clone(), e)).collect();
    vec![
        parity_for("intro", MarkerType::Intro, all_ids, &lmap, &fmap, tol_ms),
        parity_for(
            "credits",
            MarkerType::Credits,
            all_ids,
            &lmap,
            &fmap,
            tol_ms,
        ),
    ]
}

pub fn print_parity(stats: &[ParityStat], tol_ms: u64) {
    println!("\n=== PARITY: fast vs legacy (tolerance ±{tol_ms}ms) ===");
    println!(
        "{:>8}  {:>6}  {:>9}  {:>7}  {:>7}  {:>7}  {:>12}  {:>12}",
        "marker", "agree", "disagree", "only-L", "only-F", "neither", "med|Δstart|", "med|Δend|"
    );
    for s in stats {
        println!(
            "{:>8}  {:>6}  {:>9}  {:>7}  {:>7}  {:>7}  {:>10}ms  {:>10}ms",
            s.marker,
            s.both_agree,
            s.both_disagree,
            s.only_legacy,
            s.only_fast,
            s.neither,
            s.median_dstart,
            s.median_dend,
        );
    }
}

// ── Absolute accuracy vs hand labels ──────────────────────────────────────────

#[derive(Debug, Deserialize)]
pub struct Label {
    pub show: String,
    pub season: i32,
    pub episode: i32,
    /// `[start_ms, end_ms]`.
    #[serde(default)]
    pub intro: Option<[u64; 2]>,
    #[serde(default)]
    pub credits: Option<[u64; 2]>,
}

pub fn load_labels(path: &std::path::Path) -> anyhow::Result<Vec<Label>> {
    let text = std::fs::read_to_string(path)?;
    Ok(serde_json::from_str(&text)?)
}

pub struct LabelAccuracy {
    pub algo: String,
    pub marker: &'static str,
    pub matched: usize,
    pub within_tol: usize,
    pub mean_abs_start_err: f64,
}

/// For each labeled episode, compares the algorithm's detected start against the
/// label. Keyed by (show title, season, episode) via `shows` (external_id→title).
pub fn label_accuracy(
    runs: &[Run],
    shows: &[ScannedShow],
    labels: &[Label],
    tol_ms: u64,
) -> Vec<LabelAccuracy> {
    // Results carry the *parsed* provider id (e.g. "1" from "tmdb://1"), so key
    // the title lookup on that, not the full external id.
    let title_by_id: HashMap<String, String> = shows
        .iter()
        .map(|s| {
            let id = s
                .external_id
                .rsplit("://")
                .next()
                .unwrap_or(&s.external_id)
                .to_string();
            (id, s.title.to_ascii_lowercase())
        })
        .collect();

    // (title_lower, season, episode) -> (intro_label, credits_label)
    let mut label_map: HashMap<(String, i32, i32), &Label> = HashMap::new();
    for l in labels {
        label_map.insert((l.show.to_ascii_lowercase(), l.season, l.episode), l);
    }

    let mut out = Vec::new();
    // Only the latency-0 run per algo is used (accuracy is latency-independent).
    let mut seen_algo = HashSet::new();
    for r in runs {
        if !seen_algo.insert(r.algo.clone()) {
            continue;
        }
        for (marker, mt) in [
            ("intro", MarkerType::Intro),
            ("credits", MarkerType::Credits),
        ] {
            let (mut matched, mut within, mut sum_err) = (0usize, 0usize, 0f64);
            for er in &r.results {
                let (Some(season), Some(episode)) = (er.season, er.episode) else {
                    continue;
                };
                let Some(title) = title_by_id.get(&er.provider_id) else {
                    continue;
                };
                let Some(label) = label_map.get(&(title.clone(), season, episode)) else {
                    continue;
                };
                let want = match mt {
                    MarkerType::Intro => label.intro,
                    MarkerType::Credits => label.credits,
                };
                let Some(want) = want else { continue };
                let Some((got_start, _)) = marker_of(er, mt) else {
                    continue;
                };
                let err = got_start.abs_diff(want[0]);
                matched += 1;
                sum_err += err as f64;
                if err <= tol_ms {
                    within += 1;
                }
            }
            out.push(LabelAccuracy {
                algo: r.algo.clone(),
                marker,
                matched,
                within_tol: within,
                mean_abs_start_err: if matched > 0 {
                    sum_err / matched as f64
                } else {
                    0.0
                },
            });
        }
    }
    out
}

pub fn print_label_accuracy(rows: &[LabelAccuracy], tol_ms: u64) {
    if rows.is_empty() {
        return;
    }
    println!("\n=== ABSOLUTE ACCURACY vs labels (start error, tolerance ±{tol_ms}ms) ===");
    println!(
        "{:>8}  {:>8}  {:>8}  {:>10}  {:>16}",
        "algo", "marker", "matched", "within", "mean|Δstart|"
    );
    for r in rows {
        println!(
            "{:>8}  {:>8}  {:>8}  {:>8}/{:<1}  {:>14.0}ms",
            r.algo, r.marker, r.matched, r.within_tol, r.matched, r.mean_abs_start_err
        );
    }
}

// ── JSON export ───────────────────────────────────────────────────────────────

pub fn to_json(
    runs: &[Run],
    parity: &[ParityStat],
    labels: &[LabelAccuracy],
    truth: &[Label],
    detections_of: &[Run],
) -> serde_json::Value {
    // Raw per-episode detections (for eyeballing against truth) + the truth set.
    let detections: Vec<_> = detections_of
        .iter()
        .map(|r| {
            let eps: Vec<_> = r
                .results
                .iter()
                .map(|er| {
                    serde_json::json!({
                        "season": er.season,
                        "episode": er.episode,
                        "intro_ms": marker_of(er, MarkerType::Intro),
                        "credits_ms": marker_of(er, MarkerType::Credits),
                    })
                })
                .collect();
            serde_json::json!({ "algo": r.algo, "latency_ms": r.latency_ms, "episodes": eps })
        })
        .collect();
    let truth_json: Vec<_> = truth
        .iter()
        .map(|l| {
            serde_json::json!({
                "show": l.show, "season": l.season, "episode": l.episode,
                "intro_ms": l.intro, "credits_ms": l.credits,
            })
        })
        .collect();
    let speed: Vec<_> = runs
        .iter()
        .map(|r| {
            serde_json::json!({
                "latency_ms": r.latency_ms,
                "bandwidth_mbps": r.bandwidth_mbps,
                "algo": r.algo,
                "elapsed_s": r.elapsed_s,
                "episodes_marked": r.episodes_marked,
            })
        })
        .collect();
    let parity: Vec<_> = parity
        .iter()
        .map(|s| {
            serde_json::json!({
                "marker": s.marker,
                "both_agree": s.both_agree,
                "both_disagree": s.both_disagree,
                "only_legacy": s.only_legacy,
                "only_fast": s.only_fast,
                "neither": s.neither,
                "mean_dstart_ms": s.mean_dstart,
                "mean_dend_ms": s.mean_dend,
                "median_dstart_ms": s.median_dstart,
                "median_dend_ms": s.median_dend,
            })
        })
        .collect();
    let labels: Vec<_> = labels
        .iter()
        .map(|r| {
            serde_json::json!({
                "algo": r.algo,
                "marker": r.marker,
                "matched": r.matched,
                "within_tol": r.within_tol,
                "mean_abs_start_err_ms": r.mean_abs_start_err,
            })
        })
        .collect();
    serde_json::json!({
        "speed": speed,
        "parity": parity,
        "label_accuracy": labels,
        "truth": truth_json,
        "detections": detections,
    })
}
