//! Cross-episode fingerprint alignment.
//!
//! Given the fingerprints of every episode in a season, find the (start, end)
//! window where most episodes share the same audio. That's the intro
//! (or — when run on tail-window fingerprints — the credits).
//!
//! Algorithm (per pair of episode fingerprints) — a Hamming-tolerant cross
//! correlation that stays cheap on the common case but is still correct when the
//! intro sits far apart (a pilot whose title follows an 8-minute cold open):
//!   1. FAST PASS — masked-hash vote: bucket B's hashes by their top bits, vote
//!      the implied shift `(i - j)` for every colliding hash in A, take the top-K
//!      shifts, and verify a small neighbourhood of each at full resolution.
//!      This nails episodes whose intros are at similar positions (~99% of them).
//!   2. WIDE FALLBACK — only when the fast pass finds nothing: scan every shift
//!      in `±max_brute_shift` and take the longest gap-tolerant run. This catches
//!      pilots / wildly different cold-open lengths the vote can't surface.
//! Then across all pairs: median of starts + median of lengths per episode.
//!
//! Measured on real episodes: the SAME title music, once decoded + downmixed
//! (5.1→mono) + resampled, differs by ~10-11 bits/hash, and chromaprint is so
//! position-sensitive that a 1-hash misalignment collapses the match — which is
//! why we verify a *neighbourhood* of each candidate shift rather than one shift.
//!
//! Hash spacing (~0.124 s) is read per-fingerprint via [`Fingerprint::ms_per_hash`]
//! rather than assumed, so timestamps aren't scaled wrong. Returned start/end are
//! ms offsets into the *window* that was decoded.

use crate::fingerprint::Fingerprint;
use std::collections::{HashMap, HashSet};

/// Per-hash Hamming distance for *measuring* a run. Transcoded audio puts the
/// same music ~10-11 bits apart, so 12 recovers the full match while staying
/// under chromaprint's "≥15 bits ⇒ unrelated" floor.
const THRESHOLD_BITS: u32 = 12;
/// Mask applied before bucketing for the vote — drops the 5 noisiest low bits so
/// the cleanest matching hashes still collide and surface the right shift region.
const KEY_MASK: u32 = 0xFFFF_FFE0;
/// Top-K voted shifts to verify at full resolution.
const SHIFT_CANDIDATES: usize = 6;
/// Verify ± this many hashes around each candidate shift (covers the 1-3 hash
/// imprecision in which exact shift the vote lands on).
const SHIFT_NEIGHBORHOOD: i64 = 8;
/// Minimum matched run (~80 hashes ≈ 9.9 s) to treat an alignment as a marker.
const MIN_RUN_HASHES: usize = 80;
/// Bridge up to this many consecutive mismatching hashes inside a run, so a
/// brief codec glitch in the middle of an intro doesn't split it in two.
const MAX_GAP_HASHES: usize = 4;
/// When aggregating an episode's pairwise matches, treat starts within this many
/// hashes (~15 s) as the same intro. Different episodes share different amounts
/// of the intro (e.g. GoT's titles are arranged per-episode), so we take the
/// LONGEST match in this cluster — the median would undershoot the real intro.
const START_CLUSTER_TOLERANCE: usize = 120;

#[derive(Debug, Clone)]
pub struct Detection {
    pub start_ms: u64,
    pub end_ms: u64,
    pub agreement: f32,
}

/// Top-level entry point. Returns a vector matching the length of `fingerprints`.
/// Each episode gets its own Detection (or None if no intro was confidently found).
///
/// `max_brute_shift` bounds the wide fallback search (in hashes). Use a large
/// value for intros (cold-open length varies a lot between episodes) and a small
/// one for credits (always near the end of the tail window, so they barely shift).
pub fn detect_markers(
    fingerprints: &[Option<Fingerprint>],
    max_brute_shift: i64,
) -> Vec<Option<Detection>> {
    let num_eps = fingerprints.len();
    if num_eps < 2 {
        return vec![None; num_eps];
    }

    // Per episode, collect every pairwise (start_hash, length_hash) match.
    let mut matches: Vec<Vec<(usize, usize)>> = vec![Vec::new(); num_eps];

    // 1. Pairwise Comparison
    for i in 0..num_eps {
        let fp_i = match &fingerprints[i] {
            Some(f) => f,
            None => continue,
        };
        for j in (i + 1)..num_eps {
            let fp_j = match &fingerprints[j] {
                Some(f) => f,
                None => continue,
            };

            if let Some(m) = longest_run(&fp_i.hashes, &fp_j.hashes, max_brute_shift) {
                if m.length >= MIN_RUN_HASHES {
                    // m.start_a belongs to episode i, m.start_b belongs to episode j
                    matches[i].push((m.start_a, m.length));
                    matches[j].push((m.start_b, m.length));
                }
            }
        }
    }

    // 2. Per-Episode Aggregation
    let mut results = Vec::with_capacity(num_eps);
    let max_possible_pairs = (num_eps - 1).max(1) as f32;

    for i in 0..num_eps {
        // matches[i] is only ever populated from a pair whose episode i had a
        // Some(fingerprint), so this unwrap path is sound; default defensively.
        let ms_per_hash = match &fingerprints[i] {
            Some(f) => f.ms_per_hash(),
            None => {
                results.push(None);
                continue;
            }
        };

        if matches[i].is_empty() {
            results.push(None);
            continue;
        }

        // Consensus start = median (robust to a stray recap match at another
        // position). Then take the LONGEST match in that start-cluster — the
        // fullest extent of this episode's intro/credits.
        let mut start_v: Vec<usize> = matches[i].iter().map(|&(s, _)| s).collect();
        let median_start = median_usize_mut(&mut start_v);
        let (start_hash, length_hash) = matches[i]
            .iter()
            .filter(|&&(s, _)| {
                (s as i64 - median_start as i64).unsigned_abs() as usize <= START_CLUSTER_TOLERANCE
            })
            .max_by_key(|&&(_, l)| l)
            .copied()
            .unwrap_or((median_start, 0));

        let start_ms = (start_hash as f64 * ms_per_hash) as u64;
        let end_ms = ((start_hash + length_hash) as f64 * ms_per_hash) as u64;

        let agreement = matches[i].len() as f32 / max_possible_pairs;

        results.push(Some(Detection {
            start_ms,
            end_ms,
            agreement,
        }));
    }

    results
}

struct Match {
    start_a: usize,
    start_b: usize,
    length: usize,
}

/// Computes the Shannon-like entropy of a slice of hashes to detect zero-variance silence.
/// Silence usually produces repeating streams of the identical integer.
fn has_sufficient_entropy(slice: &[u32]) -> bool {
    let len = slice.len();
    if len == 0 {
        return false;
    }

    // Count unique hashes
    let mut unique = HashSet::new();
    for &h in slice {
        unique.insert(h);
    }

    // If fewer than 5% of the hashes are unique, it's almost certainly silence/noise.
    let unique_ratio = unique.len() as f32 / len as f32;
    unique_ratio > 0.05
}

#[inline]
fn key(h: u32) -> u32 {
    h & KEY_MASK
}

fn longest_run(a: &[u32], b: &[u32], max_brute_shift: i64) -> Option<Match> {
    if a.len() < MIN_RUN_HASHES || b.len() < MIN_RUN_HASHES {
        return None;
    }

    // FAST PASS: vote on shifts, then verify a neighbourhood of the top-K.
    let mut best = verify_shifts(a, b, &vote_shift_candidates(a, b));

    // WIDE FALLBACK: only if the cheap pass found nothing (e.g. a pilot whose
    // title sits hundreds of seconds further in than the others').
    if best.is_none() && max_brute_shift > 0 {
        let lo = (-max_brute_shift).max(-(b.len() as i64 - 1));
        let hi = max_brute_shift.min(a.len() as i64 - 1);
        for shift in lo..=hi {
            if let Some(m) = run_at_shift(a, b, shift) {
                if best.as_ref().map_or(true, |c| m.length > c.length) {
                    best = Some(m);
                }
            }
        }
    }
    best
}

/// Masked-hash vote: returns the top-K shifts where the most (near-)identical
/// hashes line up. Cheap (O(N)) and finds same-position intros instantly.
fn vote_shift_candidates(a: &[u32], b: &[u32]) -> Vec<i64> {
    let mut index: HashMap<u32, Vec<usize>> = HashMap::with_capacity(b.len());
    for (j, &h) in b.iter().enumerate() {
        index.entry(key(h)).or_default().push(j);
    }
    let mut votes: HashMap<i64, u32> = HashMap::new();
    for (i, &h) in a.iter().enumerate() {
        if let Some(js) = index.get(&key(h)) {
            for &j in js {
                *votes.entry(i as i64 - j as i64).or_default() += 1;
            }
        }
    }
    let mut scored: Vec<(u32, i64)> = votes.into_iter().map(|(s, v)| (v, s)).collect();
    scored.sort_unstable_by_key(|&(votes, _)| std::cmp::Reverse(votes));
    scored
        .into_iter()
        .take(SHIFT_CANDIDATES)
        .map(|(_, s)| s)
        .collect()
}

/// Verify a neighbourhood around each candidate shift; return the longest run.
fn verify_shifts(a: &[u32], b: &[u32], candidates: &[i64]) -> Option<Match> {
    let mut best: Option<Match> = None;
    let mut seen: HashSet<i64> = HashSet::new();
    for &c in candidates {
        for shift in (c - SHIFT_NEIGHBORHOOD)..=(c + SHIFT_NEIGHBORHOOD) {
            if !seen.insert(shift) {
                continue;
            }
            if let Some(m) = run_at_shift(a, b, shift) {
                if best.as_ref().map_or(true, |cur| m.length > cur.length) {
                    best = Some(m);
                }
            }
        }
    }
    best
}

/// Longest gap-tolerant run under `THRESHOLD_BITS` at a fixed shift, on the full
/// hashes. `a[i]` aligns with `b[i - shift]`.
fn run_at_shift(a: &[u32], b: &[u32], shift: i64) -> Option<Match> {
    let i_lo = shift.max(0) as usize;
    let i_hi = (a.len() as i64).min(shift + b.len() as i64);
    if i_hi <= i_lo as i64 {
        return None;
    }
    let i_hi = i_hi as usize;

    let mut best_run = 0usize;
    let mut best_start_a = i_lo;
    let mut run_start: Option<usize> = None;
    let mut last_match = i_lo;
    for i in i_lo..i_hi {
        let j = (i as i64 - shift) as usize;
        let matched = (a[i] ^ b[j]).count_ones() <= THRESHOLD_BITS;
        match run_start {
            None => {
                if matched {
                    run_start = Some(i);
                    last_match = i;
                }
            }
            Some(start) => {
                if matched {
                    last_match = i;
                    let run_len = last_match + 1 - start;
                    if run_len > best_run {
                        best_run = run_len;
                        best_start_a = start;
                    }
                } else if i - last_match > MAX_GAP_HASHES {
                    run_start = None; // gap too long — end this run
                }
            }
        }
    }

    if best_run < MIN_RUN_HASHES {
        return None;
    }

    // Silence / flat-noise filter: a run of near-identical hashes is silence or
    // a static tone repeated across episodes, not a real intro/credits cue.
    let slice_a = &a[best_start_a..best_start_a + best_run];
    if !has_sufficient_entropy(slice_a) {
        return None;
    }

    Some(Match {
        start_a: best_start_a,
        start_b: (best_start_a as i64 - shift) as usize,
        length: best_run,
    })
}

/// Truly mutates the input slice to avoid cloning allocations.
fn median_usize_mut(v: &mut [usize]) -> usize {
    if v.is_empty() {
        return 0;
    }
    v.sort_unstable();
    v[v.len() / 2]
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fingerprint::Fingerprint;

    /// A well-mixed hash of (seed, i) — so different seeds give INDEPENDENT
    /// sequences (unlike an LCG, whose seeds are just offsets into one cycle).
    /// Stands in for the high-entropy fingerprint of unique content.
    fn mix(seed: u32, i: u32) -> u32 {
        let mut z = seed.wrapping_mul(0x9E37_79B1) ^ i.wrapping_mul(0x85EB_CA77);
        z ^= z >> 16;
        z = z.wrapping_mul(0x7FEB_352D);
        z ^= z >> 15;
        z = z.wrapping_mul(0x846C_A68B);
        z ^= z >> 16;
        z
    }

    fn noise(seed: u32, n: usize) -> Vec<u32> {
        (0..n as u32).map(|i| mix(seed, i)).collect()
    }

    /// Fingerprint whose ms_per_hash is exactly 124 ms (duration = n * 0.124 s).
    fn fp(hashes: Vec<u32>) -> Fingerprint {
        let secs = hashes.len() as f64 * 0.124;
        Fingerprint {
            hashes,
            duration_secs: secs,
        }
    }

    #[test]
    fn entropy_rejects_silence_accepts_content() {
        assert!(!has_sufficient_entropy(&vec![7u32; 200])); // one repeated value = silence
        assert!(has_sufficient_entropy(&noise(3, 200)));
    }

    #[test]
    fn run_at_shift_locates_shared_segment() {
        let shared = noise(42, 120);
        // a: 30 filler + shared + 30 filler ; b: 10 filler + shared + 40 filler
        let mut a = noise(1, 30);
        a.extend_from_slice(&shared);
        a.extend(noise(2, 30));
        let mut b = noise(3, 10);
        b.extend_from_slice(&shared);
        b.extend(noise(4, 40));
        // shared at 30 in a, 10 in b → shift = 30 - 10 = 20
        let m = run_at_shift(&a, &b, 20).expect("shared run found");
        assert_eq!(m.start_a, 30);
        assert_eq!(m.start_b, 10);
        assert!(m.length >= 118, "length {} too short", m.length);
    }

    #[test]
    fn run_at_shift_rejects_unrelated() {
        let a = noise(1, 300);
        let b = noise(999, 300);
        assert!(run_at_shift(&a, &b, 0).is_none());
    }

    #[test]
    fn detect_markers_aligns_shared_intro_across_episodes() {
        let shared = noise(77, 120); // ~15 s recurring "intro"
        let mk = |seed: u32, pos: usize| {
            let mut v = noise(seed, pos);
            v.extend_from_slice(&shared);
            v.extend(noise(seed.wrapping_add(500), 60));
            fp(v)
        };
        // Same recurring segment at DIFFERENT positions (varying cold-open length).
        let cases = [(11u32, 30usize), (22, 70), (33, 15)];
        let fps: Vec<Option<Fingerprint>> = cases.iter().map(|&(s, p)| Some(mk(s, p))).collect();

        let det = detect_markers(&fps, 300);
        for (i, &(_, pos)) in cases.iter().enumerate() {
            let d = det[i]
                .as_ref()
                .unwrap_or_else(|| panic!("no detection for ep {i}"));
            let start_hash = (d.start_ms as f64 / 124.0).round() as i64;
            // Gap-tolerant matching can absorb a few adjacent chance-matched filler
            // hashes, so the boundary drifts ~1 s — as seen on real audio.
            assert!(
                (start_hash - pos as i64).abs() <= 10,
                "ep{i} start {start_hash} vs {pos}"
            );
            let len_hash = (d.end_ms - d.start_ms) as f64 / 124.0;
            assert!(
                (110.0..=140.0).contains(&len_hash),
                "ep{i} length {len_hash}"
            );
            assert!(d.agreement > 0.5, "ep{i} agreement {}", d.agreement);
        }
    }

    #[test]
    fn detect_markers_finds_nothing_in_unrelated_episodes() {
        let fps: Vec<Option<Fingerprint>> =
            (0..4).map(|i| Some(fp(noise(1000 + i, 300)))).collect();
        let det = detect_markers(&fps, 300);
        assert!(
            det.iter().all(|d| d.is_none()),
            "spurious detection on unrelated audio"
        );
    }
}
