//! Shared types for the detector pipeline (also serialized to the app's JS UI).

use serde::{Deserialize, Serialize};

#[derive(Clone, Debug, Deserialize)]
pub struct EpisodeInput {
    pub id: String,
    pub stream_url: String,
    /// Episode duration in ms — needed both to clamp the credits scan window
    /// and to ship as the `duration_ms` sanity check on the submission.
    pub duration_ms: u64,
    pub season: i32,
    pub episode: i32,
    pub headers: Option<std::collections::HashMap<String, String>>,
}

#[derive(Clone, Copy, Debug, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "lowercase")]
pub enum MediaKind {
    #[default]
    Tv,
    Movie,
}

#[derive(Clone, Debug, Deserialize)]
pub struct ShowInput {
    pub title: String,
    /// `tmdb://1399` etc. We submit using the first id that parses cleanly.
    pub external_ids: Vec<String>,
    /// TV shows use cross-episode fingerprint alignment; movies have no siblings
    /// and instead use the black-frame/chapter detector in [`crate::segment`].
    #[serde(default)]
    pub kind: MediaKind,
    pub seasons: Vec<SeasonInput>,
}

#[derive(Clone, Debug, Deserialize)]
pub struct SeasonInput {
    pub season_number: i32,
    pub episodes: Vec<EpisodeInput>,
}

#[derive(Clone, Debug, Serialize)]
pub struct DetectedMarker {
    pub marker_type: MarkerType,
    pub start_ms: u64,
    pub end_ms: u64,
}

#[derive(Clone, Copy, Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum MarkerType {
    Intro,
    Credits,
}

#[derive(Clone, Debug, Serialize)]
pub struct EpisodeResult {
    pub episode_id: String,
    pub provider: String,
    pub provider_id: String,
    /// `None` for movies — the submit endpoint keys those on (provider, id) with
    /// season/episode coalesced to -1.
    pub season: Option<i32>,
    pub episode: Option<i32>,
    pub duration_ms: u64,
    pub markers: Vec<DetectedMarker>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ProgressEvent {
    Started { total_shows: usize, total_episodes: usize },
    Show { index: usize, title: String, season_count: usize },
    Season { show_title: String, season_number: i32, episode_count: usize },
    Episode { show_title: String, season_number: i32, episode_number: i32, stage: EpisodeStage },
    EpisodeMarkers { show_title: String, season_number: i32, episode_number: i32, intro_ms: Option<(u64, u64)>, credits_ms: Option<(u64, u64)> },
    ShowFinished { title: String, episode_results: usize },
    Finished { total_episodes_marked: usize },
    Failed { message: String },
}

#[derive(Clone, Copy, Debug, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum EpisodeStage {
    Decoding,
    Fingerprinting,
    Done,
    Failed,
}
