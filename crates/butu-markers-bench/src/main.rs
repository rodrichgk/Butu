//! Speed + accuracy benchmark for `butu-markers`.
//!
//! Drives BOTH detection algorithms (legacy + fast) over a real show library,
//! optionally through a latency/bandwidth-throttled local HTTP server that
//! mimics remote Plex/Jellyfin streaming, and reports:
//!   * wall-clock per (latency, algorithm) + the legacy÷fast speedup,
//!   * fast-vs-legacy parity (is fast a safe drop-in?),
//!   * absolute error vs an optional hand-labeled ground-truth JSON.
//!
//! Example:
//!   cargo run -p butu-markers-bench --release -- \
//!     --root "G:\Shows" --shows "LUCIFER" --latency 0,50,150 --concurrency 3

mod cache;
mod netsim;
mod report;
mod scan;
mod truth;

use std::collections::HashSet;
use std::path::{Path, PathBuf};
use std::sync::atomic::AtomicBool;
use std::sync::Arc;
use std::time::{Duration, Instant};

use butu_markers::{
    analyze, analyze_fast, EpisodeResult, MediaRunner, NullSink, ProcessRunner, ProgressSink,
    ShowInput, DEFAULT_CONCURRENCY,
};
use clap::Parser;

use crate::netsim::{NetSim, Throttle};
use crate::report::Run;

#[derive(Parser, Debug)]
#[command(about = "Speed + accuracy benchmark for the butu-markers intro/credits detector")]
struct Args {
    /// Library root, e.g. "G:\\Shows".
    #[arg(long)]
    root: PathBuf,

    /// Only benchmark shows whose folder name contains one of these (case-insensitive).
    #[arg(long, value_delimiter = ',')]
    shows: Option<Vec<String>>,

    /// Only analyze these season numbers (comma-separated), e.g. --seasons 1.
    #[arg(long, value_delimiter = ',')]
    seasons: Option<Vec<i32>>,

    /// Cache ffmpeg decode outputs in this dir so re-runs skip decoding (fast
    /// accuracy iteration). Best with --latency 0 (local paths).
    #[arg(long)]
    cache_dir: Option<PathBuf>,

    /// Which algorithms to run.
    #[arg(long, value_delimiter = ',', default_value = "legacy,fast")]
    algos: Vec<String>,

    /// Simulated added latency per request, in ms. 0 = direct local files (no server).
    #[arg(long, value_delimiter = ',', default_value = "0")]
    latency: Vec<u64>,

    /// Optional bandwidth cap in MB/s (applies to every latency > 0).
    #[arg(long)]
    bandwidth: Option<f64>,

    /// Episodes analyzed concurrently by the fast pipeline.
    #[arg(long)]
    concurrency: Option<usize>,

    /// Optional hand-labeled ground-truth JSON for absolute accuracy.
    #[arg(long)]
    labels: Option<PathBuf>,

    /// Fetch REAL ground-truth markers from IntroDB (introdb.app), resolving each
    /// show's IMDb id via TVMaze. Overrides --labels when set.
    #[arg(long, default_value_t = false)]
    truth: bool,

    /// ffmpeg / fpcalc binaries (default: the app's bundled sidecars).
    #[arg(long)]
    ffmpeg: Option<PathBuf>,
    #[arg(long)]
    fpcalc: Option<PathBuf>,

    /// Agreement tolerance for parity + label accuracy, in ms.
    #[arg(long, default_value_t = 2000)]
    tol_ms: u64,

    /// Where to write the machine-readable report.
    #[arg(long, default_value = "report.json")]
    out: PathBuf,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let args = Args::parse();

    let ffmpeg = resolve_bin(args.ffmpeg.clone(), "ffmpeg");
    let fpcalc = resolve_bin(args.fpcalc.clone(), "fpcalc");
    println!("ffmpeg: {}", ffmpeg.display());
    println!("fpcalc: {}", fpcalc.display());
    let base = ProcessRunner::new(ffmpeg, fpcalc);
    let runner: Arc<dyn MediaRunner> = match &args.cache_dir {
        Some(dir) => {
            println!("decode cache: {}", dir.display());
            Arc::new(cache::CachingRunner::new(base, dir.clone())?)
        }
        None => Arc::new(base),
    };

    // Discover + probe.
    println!("\nscanning {} …", args.root.display());
    let mut shows = scan::scan(&args.root, args.shows.as_deref())?;
    if shows.is_empty() {
        anyhow::bail!("no shows found under {}", args.root.display());
    }
    if let Some(seasons) = &args.seasons {
        scan::filter_seasons(&mut shows, seasons);
    }
    scan::probe_durations(&runner, &mut shows, 8).await;
    let total_eps: usize = shows.iter().map(|s| s.episodes.len()).sum();
    for s in &shows {
        println!("  {} — {} episodes", s.title, s.episodes.len());
    }
    println!("total: {} shows, {} episodes\n", shows.len(), total_eps);
    if total_eps == 0 {
        anyhow::bail!("no probeable episodes (need ≥2 per season)");
    }

    let all_ids: HashSet<String> = shows
        .iter()
        .flat_map(|s| s.episodes.iter().map(|e| e.id.clone()))
        .collect();

    let bandwidth_bps = args.bandwidth.map(|mb| (mb * 1_000_000.0) as u64);
    let concurrency = args.concurrency.unwrap_or(DEFAULT_CONCURRENCY);

    let mut runs: Vec<Run> = Vec::new();

    for &lat in &args.latency {
        // Latency 0 with no bandwidth cap → hit local files directly (true baseline).
        let use_server = lat > 0 || bandwidth_bps.is_some();
        let server: Option<NetSim> = if use_server {
            Some(
                netsim::spawn(
                    args.root.clone(),
                    Throttle {
                        latency: Duration::from_millis(lat),
                        bandwidth_bps,
                    },
                )
                .await?,
            )
        } else {
            None
        };

        let show_inputs = scan::to_show_inputs(&shows, server.as_ref());

        for algo in &args.algos {
            println!("running {algo} @ {lat}ms latency …");
            let (elapsed, results) = run_once(algo, &runner, &show_inputs, concurrency).await;
            let marked = results.len();
            println!("  {algo} @ {lat}ms: {elapsed:.1}s, {marked} episodes marked");
            runs.push(Run {
                latency_ms: lat,
                bandwidth_mbps: args.bandwidth,
                algo: algo.clone(),
                elapsed_s: elapsed,
                episodes_marked: marked,
                results,
            });
        }

        if let Some(s) = server {
            s.stop();
        }
    }

    // ── Report ────────────────────────────────────────────────────────────────
    report::print_speed(&runs);

    // Parity from a latency where both algorithms ran (detection is
    // latency-independent, so any works; prefer the smallest).
    let parity = compute_parity(&runs, &all_ids, args.tol_ms);
    if let Some(p) = &parity {
        report::print_parity(p, args.tol_ms);
    }

    let labels: Vec<report::Label> = if args.truth {
        println!("\nfetching real ground-truth markers from IntroDB …");
        match truth::fetch_labels(&shows).await {
            Ok(l) => l,
            Err(e) => {
                eprintln!("warning: IntroDB truth fetch failed: {e}");
                Vec::new()
            }
        }
    } else if let Some(path) = &args.labels {
        report::load_labels(path).unwrap_or_else(|e| {
            eprintln!("warning: couldn't load labels: {e}");
            Vec::new()
        })
    } else {
        Vec::new()
    };
    let label_rows = if labels.is_empty() {
        Vec::new()
    } else {
        let rows = report::label_accuracy(&runs, &shows, &labels, args.tol_ms);
        report::print_label_accuracy(&rows, args.tol_ms);
        rows
    };

    let json = report::to_json(
        &runs,
        parity.as_deref().unwrap_or(&[]),
        &label_rows,
        &labels,
        &runs,
    );
    std::fs::write(&args.out, serde_json::to_string_pretty(&json)?)?;
    println!("\nwrote {}", args.out.display());

    Ok(())
}

async fn run_once(
    algo: &str,
    runner: &Arc<dyn MediaRunner>,
    shows: &[ShowInput],
    concurrency: usize,
) -> (f64, Vec<EpisodeResult>) {
    let sink: Arc<dyn ProgressSink> = Arc::new(NullSink);
    let cancel = Arc::new(AtomicBool::new(false));
    let start = Instant::now();
    let res = match algo {
        "legacy" => analyze(runner.clone(), sink, shows.to_vec(), cancel).await,
        "fast" => analyze_fast(runner.clone(), sink, shows.to_vec(), cancel, concurrency).await,
        other => {
            eprintln!("unknown algo '{other}', skipping");
            Ok(Vec::new())
        }
    };
    let elapsed = start.elapsed().as_secs_f64();
    let results = match res {
        Ok(r) => r,
        Err(e) => {
            eprintln!("  {algo} failed: {e}");
            Vec::new()
        }
    };
    (elapsed, results)
}

/// Picks a latency where both legacy and fast ran and returns their parity.
fn compute_parity(
    runs: &[Run],
    all_ids: &HashSet<String>,
    tol_ms: u64,
) -> Option<Vec<report::ParityStat>> {
    let mut lats: Vec<u64> = runs.iter().map(|r| r.latency_ms).collect();
    lats.sort_unstable();
    lats.dedup();
    for lat in lats {
        let legacy = runs
            .iter()
            .find(|r| r.latency_ms == lat && r.algo == "legacy");
        let fast = runs
            .iter()
            .find(|r| r.latency_ms == lat && r.algo == "fast");
        if let (Some(l), Some(f)) = (legacy, fast) {
            return Some(report::parity(all_ids, &l.results, &f.results, tol_ms));
        }
    }
    None
}

/// Resolves an ffmpeg/fpcalc path: the flag if given, else the app's bundled
/// sidecar, else the workspace `target/debug` copy, else bare name (PATH).
fn resolve_bin(flag: Option<PathBuf>, name: &str) -> PathBuf {
    if let Some(p) = flag {
        return p;
    }
    if let Some(ws) = Path::new(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .and_then(|p| p.parent())
    {
        let bindir = ws.join("src-tauri").join("binaries");
        if let Ok(rd) = std::fs::read_dir(&bindir) {
            for e in rd.flatten() {
                if e.file_name()
                    .to_string_lossy()
                    .to_ascii_lowercase()
                    .starts_with(name)
                {
                    return e.path();
                }
            }
        }
        for cand in [format!("{name}.exe"), name.to_string()] {
            let p = ws.join("target").join("debug").join(&cand);
            if p.exists() {
                return p;
            }
        }
    }
    PathBuf::from(name)
}
