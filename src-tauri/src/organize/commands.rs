//! Tauri commands exposing the organize engine to the React UI. Stateless: the
//! config lives in the React store (persisted to localStorage) and is passed in
//! on every call, so Rust stays pure compute + filesystem ops.

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::organize::{self, Config, ExecuteStats, PlannedOp, Rule};

#[derive(Debug, Deserialize)]
pub struct PlanArgs {
    pub paths: Vec<String>,
    pub config: Config,
}

#[derive(Debug, Serialize)]
pub struct PlanResult {
    pub ops: Vec<PlannedOp>,
    pub unrecognized: Vec<String>,
}

#[tauri::command]
pub async fn organize_plan(args: PlanArgs) -> Result<PlanResult, String> {
    let paths: Vec<PathBuf> = args.paths.into_iter().map(PathBuf::from).collect();
    let (ops, unrecognized) = organize::auto_plan(&paths, &args.config);
    Ok(PlanResult { ops, unrecognized })
}

#[derive(Debug, Deserialize)]
pub struct ExecuteArgs {
    pub ops: Vec<PlannedOp>,
}

#[derive(Debug, Serialize)]
pub struct ExecuteResult {
    #[serde(flatten)]
    pub stats: ExecuteStats,
    pub log: Vec<String>,
}

#[tauri::command]
pub async fn organize_execute(args: ExecuteArgs) -> Result<ExecuteResult, String> {
    let mut log = Vec::new();
    let stats = organize::execute(&args.ops, false, |line| log.push(line));
    Ok(ExecuteResult { stats, log })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BuildRuleArgs {
    pub kind: String, // "TV" or "MOVIE"
    pub name: String,
    #[serde(default)]
    pub year: String,
    #[serde(default)]
    pub file_types: Vec<String>,
    pub tv_root: String,
    pub movie_root: String,
}

#[tauri::command]
pub async fn organize_build_rule(args: BuildRuleArgs) -> Result<Rule, String> {
    let rule = if args.kind.eq_ignore_ascii_case("TV") {
        organize::build_tv_rule(&args.name, &args.year, args.file_types, &args.tv_root)
    } else {
        organize::build_movie_rule(&args.name, &args.year, args.file_types, &args.movie_root)
    };
    Ok(rule)
}
