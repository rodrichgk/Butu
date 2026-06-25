//! Library-wide intro/credits auto-detection.
//!
//! Pipeline:
//!     library → per show → per season → for each ep:
//!         ffmpeg sidecar decodes a chunk of audio to mono 22050 Hz raw PCM
//!         fpcalc sidecar fingerprints it (chromaprint)
//!     detect.rs aligns the fingerprints across the season's episodes;
//!     the longest interval where ≥half of episode-pairs agree is the marker.
//!
//! The Tauri commands in [`commands`] expose the pipeline to the React UI and
//! emit progress events the modal listens to.

pub mod audio;
pub mod commands;
pub mod detect;
pub mod fingerprint;
pub mod pipeline;
pub mod segment;
pub mod types;
