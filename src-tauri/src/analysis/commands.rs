//! Tauri commands exposed to the React UI. The pipeline runs in a background
//! task so the UI stays responsive; progress is streamed via `analysis-progress`
//! events.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager, State};
use tokio::sync::Mutex;

use butu_markers::{
    analyze, analyze_fast, CancelFlag, EpisodeResult, MediaRunner, ProgressSink, ShowInput,
    DEFAULT_CONCURRENCY,
};

use crate::analysis::tauri_runner::{TauriRunner, TauriSink};

/// Which detection algorithm to run. `Fast` is the default and the only one the
/// UI selects — it's the concurrent, remote-optimized pipeline with the accurate
/// credit-fade detection. `Legacy` is kept (callable via the API) for reference /
/// A/B benchmarking but is otherwise unused.
#[derive(Debug, Clone, Copy, Deserialize, Default, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum Analyzer {
    Legacy,
    #[default]
    Fast,
}

/// Shared state held in Tauri's `manage` slot so the cancel command can flip
/// the flag on a running analysis. Also stores the latest result set so the UI
/// can re-query it after a route change.
#[derive(Default)]
pub struct AnalysisState {
    pub cancel_flag: Mutex<Option<Arc<AtomicBool>>>,
    pub latest_results: Mutex<Vec<EpisodeResult>>,
}

#[derive(Debug, Deserialize)]
pub struct AnalyzeArgs {
    pub shows: Vec<ShowInput>,
    /// `"legacy"` (default) or `"fast"`. Omitted by older UI builds → legacy.
    #[serde(default)]
    pub algorithm: Analyzer,
    /// Only used by the fast pipeline. `None` → [`DEFAULT_CONCURRENCY`].
    #[serde(default)]
    pub concurrency: Option<usize>,
}

#[derive(Debug, Serialize)]
pub struct AnalyzeResponse {
    pub episode_count: usize,
}

#[tauri::command]
pub async fn analyze_library(
    app: AppHandle,
    state: State<'_, AnalysisState>,
    args: AnalyzeArgs,
) -> Result<AnalyzeResponse, String> {
    {
        let mut guard = state.cancel_flag.lock().await;
        if guard.is_some() {
            return Err("analysis already in progress".into());
        }
        let flag = CancelFlag::new();
        *guard = Some(flag.clone_inner());
    }
    // Snapshot the cancel handle so we can hand it to the spawned task.
    let cancel = state.cancel_flag.lock().await.as_ref().cloned().unwrap();

    // The crate is host-agnostic; wrap Tauri's sidecar shell + event emitter in
    // the runner/sink adapters it expects.
    let runner: Arc<dyn MediaRunner> = Arc::new(TauriRunner::new(app.clone()));
    let sink: Arc<dyn ProgressSink> = Arc::new(TauriSink::new(app.clone()));

    let results = match args.algorithm {
        Analyzer::Legacy => analyze(runner, sink, args.shows, cancel).await,
        Analyzer::Fast => {
            let concurrency = args.concurrency.unwrap_or(DEFAULT_CONCURRENCY);
            analyze_fast(runner, sink, args.shows, cancel, concurrency).await
        }
    };

    // Whatever the outcome, clear the cancel flag so a new run can start.
    *state.cancel_flag.lock().await = None;

    match results {
        Ok(rs) => {
            let count = rs.len();
            *state.latest_results.lock().await = rs;
            Ok(AnalyzeResponse { episode_count: count })
        }
        Err(e) => Err(e),
    }
}

#[tauri::command]
pub async fn cancel_analysis(state: State<'_, AnalysisState>) -> Result<(), String> {
    if let Some(flag) = state.cancel_flag.lock().await.as_ref() {
        flag.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[derive(Debug, Deserialize)]
pub struct SubmitArgs {
    pub endpoint: String,        // https://<project>.supabase.co/functions/v1/submit-markers
    pub anon_key: String,
    pub submitted_by: Option<String>,
    pub source: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct SubmitResponse {
    pub inserted: u64,
    pub episode_count: usize,
}

/// Posts the latest [`AnalysisState::latest_results`] to the submit-markers
/// edge function. Batches into chunks of 100 episodes so a single 500-ep
/// library doesn't blow past the function's max-payload limit.
#[tauri::command]
pub async fn submit_markers(
    state: State<'_, AnalysisState>,
    args: SubmitArgs,
) -> Result<SubmitResponse, String> {
    let results = state.latest_results.lock().await.clone();
    if results.is_empty() {
        return Err("no detected markers to submit — run analysis first".into());
    }

    let mut total_inserted: u64 = 0;
    let client = reqwest::Client::new();

    for chunk in results.chunks(100) {
        let episodes: Vec<serde_json::Value> = chunk
            .iter()
            .map(|er| {
                let markers: Vec<serde_json::Value> = er
                    .markers
                    .iter()
                    .map(|m| serde_json::json!({
                        "marker_type": m.marker_type,
                        "start_ms": m.start_ms,
                        "end_ms": m.end_ms,
                    }))
                    .collect();
                serde_json::json!({
                    "provider": er.provider,
                    "provider_id": er.provider_id,
                    "season": er.season,
                    "episode": er.episode,
                    "duration_ms": er.duration_ms,
                    "markers": markers,
                })
            })
            .collect();

        let body = serde_json::json!({
            "submitted_by": args.submitted_by.clone().unwrap_or_else(|| "auto".into()),
            "source": args.source.clone().unwrap_or_else(|| format!("butu-companion/{}", env!("CARGO_PKG_VERSION"))),
            "episodes": episodes,
        });

        let resp = client
            .post(&args.endpoint)
            .header("authorization", format!("Bearer {}", args.anon_key))
            .header("content-type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("submit POST failed: {e}"))?;

        let status = resp.status();
        let text = resp.text().await.unwrap_or_default();
        if !status.is_success() {
            return Err(format!("submit returned {status}: {text}"));
        }
        let parsed: serde_json::Value =
            serde_json::from_str(&text).map_err(|e| format!("submit JSON parse: {e}: {text}"))?;
        if let Some(n) = parsed.get("inserted").and_then(|v| v.as_u64()) {
            total_inserted += n;
        }
    }

    Ok(SubmitResponse {
        inserted: total_inserted,
        episode_count: results.len(),
    })
}

/// Used during `setup` in lib.rs.
pub fn register(app: &mut tauri::App) {
    app.manage(AnalysisState::default());
}
