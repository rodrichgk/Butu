# butu-markers

Cross-episode audio-fingerprint detection of TV **intros** and **credits/outros**.

Given a library of shows → seasons → episodes, it finds the segment most episodes
of a season agree on — the intro (or, on the tail window, the recurring end-theme)
— via [Chromaprint](https://acoustid.org/chromaprint) fingerprint alignment, with
video-based fallbacks (embedded chapters, a luma-based credit fade-in detector) for
content that has no reusable audio cue.

It is decoupled from any process host: it never spawns `ffmpeg`/`fpcalc` itself but
goes through the [`MediaRunner`] trait, so you can wrap the binaries however you
like. A ready-made [`ProcessRunner`] (feature `process`) spawns them directly.

## Two pipelines

- [`analyze`] — the original, sequential pipeline.
- [`analyze_fast`] — a concurrent, remote-stream-optimized variant. On 1080p10
  HEVC it runs ~6× faster (the big win is *not* using `-hwaccel auto` for the tiny
  video filter passes, where it's actually ~5× slower), and it detects the visual
  credit-roll start (not just the recurring end-theme).

## Accuracy

Validated against hand-verified [IntroDB](https://introdb.app) markers on a full
show with a recurring intro: intros 100% within 10 s (median ~2 s), credit-roll
starts ~90% within 10 s (median ~0.5 s). Note the inherent limit of audio
fingerprinting: shows **without** a recurring musical intro (short title stings,
some dramas) can't be detected — the detector is gated to emit *nothing* rather
than a wrong marker. Pair it with a marker DB for those.

## Example

```rust,no_run
use std::sync::{Arc, atomic::AtomicBool};
use butu_markers::{
    analyze_fast, ProcessRunner, NullSink, MediaRunner, ProgressSink,
    ShowInput, DEFAULT_CONCURRENCY,
};

# async fn demo(shows: Vec<ShowInput>) -> Result<(), String> {
let runner: Arc<dyn MediaRunner> = Arc::new(ProcessRunner::new("ffmpeg", "fpcalc"));
let sink: Arc<dyn ProgressSink> = Arc::new(NullSink);
let cancel = Arc::new(AtomicBool::new(false));

let results = analyze_fast(runner, sink, shows, cancel, DEFAULT_CONCURRENCY).await?;
for ep in results {
    println!("{} — {:?}", ep.episode_id, ep.markers);
}
# Ok(()) }
```

Requires the `ffmpeg` and `fpcalc` (Chromaprint) binaries on the system when using
`ProcessRunner`.

## License

Licensed under either of MIT or Apache-2.0 at your option.
