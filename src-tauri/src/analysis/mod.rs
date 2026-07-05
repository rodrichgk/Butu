//! Tauri adapter around the standalone [`butu_markers`] detector crate.
//!
//! The detection algorithm itself now lives in `crates/butu-markers` (host- and
//! Tauri-agnostic, publishable). This module only wires it into the app:
//! [`commands`] exposes the Tauri commands the React UI calls, and
//! [`tauri_runner`] implements the crate's `MediaRunner` + `ProgressSink` traits
//! over the bundled ffmpeg/fpcalc sidecars and `app.emit`.

pub mod commands;
pub mod cache;
mod tauri_runner;
