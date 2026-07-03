//! Progress reporting seam. The Tauri app forwards these to the JS UI via
//! `app.emit`; the benchmark records timestamps; a library consumer that doesn't
//! care can pass [`NullSink`].

use crate::types::ProgressEvent;

/// Receives pipeline progress events. Implementations must be cheap and
/// non-blocking — they're called from inside the concurrent analysis tasks.
pub trait ProgressSink: Send + Sync {
    fn emit(&self, ev: &ProgressEvent);
}

/// Drops every event. Use when progress isn't needed.
pub struct NullSink;

impl ProgressSink for NullSink {
    fn emit(&self, _ev: &ProgressEvent) {}
}
