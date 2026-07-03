//! Cross-episode audio-fingerprint detection of TV intros and credits/outros.
//!
//! Given a library of shows → seasons → episodes, this finds the segment most
//! episodes of a season agree on (the intro, or — on the tail window — the
//! recurring end-theme) via chromaprint fingerprint alignment, with video-based
//! fallbacks (embedded chapters, fade-to-black) for content that has no reusable
//! audio cue (movies, shows like Game of Thrones).
//!
//! Two algorithms ship side by side so they can be compared:
//! - [`analyze`] — the original, sequential pipeline.
//! - [`analyze_fast`] — a concurrent, remote-stream-optimized variant.
//!
//! # Decoupling
//! The detector never spawns processes itself — it goes through the
//! [`MediaRunner`] trait, so a host can wrap `ffmpeg`/`fpcalc` however it likes
//! (bundled sidecars, system binaries, a remote worker). A ready-made
//! [`ProcessRunner`] (behind the `process` feature) spawns the two binaries
//! directly. Progress is reported through [`ProgressSink`] ([`NullSink`] to
//! ignore it).
//!
//! # Example
//! ```no_run
//! # #[cfg(feature = "process")]
//! # async fn demo() -> Result<(), String> {
//! use std::sync::{Arc, atomic::AtomicBool};
//! use butu_markers::{analyze_fast, ProcessRunner, NullSink, MediaRunner, ProgressSink,
//!     DEFAULT_CONCURRENCY, ShowInput};
//!
//! let runner: Arc<dyn MediaRunner> = Arc::new(ProcessRunner::new("ffmpeg", "fpcalc"));
//! let sink: Arc<dyn ProgressSink> = Arc::new(NullSink);
//! let shows: Vec<ShowInput> = vec![/* … */];
//! let cancel = Arc::new(AtomicBool::new(false));
//! let results = analyze_fast(runner, sink, shows, cancel, DEFAULT_CONCURRENCY).await?;
//! # Ok(()) }
//! ```

pub mod audio;
pub mod detect;
pub mod fingerprint;
pub mod pipeline;
pub mod pipeline_fast;
pub mod progress;
pub mod runner;
pub mod segment;
pub mod types;

// ── Curated public API ────────────────────────────────────────────────────────
pub use pipeline::{analyze, CancelFlag};
pub use pipeline_fast::{analyze_fast, DEFAULT_CONCURRENCY};
pub use progress::{NullSink, ProgressSink};
pub use runner::{CmdOutput, MediaRunner};
pub use types::{
    DetectedMarker, EpisodeInput, EpisodeResult, EpisodeStage, MarkerType, MediaKind,
    ProgressEvent, SeasonInput, ShowInput,
};

#[cfg(feature = "process")]
pub use runner::ProcessRunner;
