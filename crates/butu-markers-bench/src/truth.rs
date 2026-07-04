//! Real ground-truth markers from the public IntroDB crowd database
//! (<https://introdb.app>), which returns per-episode intro/outro timestamps
//! keyed by IMDb id. Each show's IMDb id is resolved from its title via TVMaze
//! (the same public API the app already uses). No API keys required.

use crate::report::Label;
use crate::scan::ScannedShow;

const TVMAZE: &str = "https://api.tvmaze.com/singlesearch/shows";
const INTRODB: &str = "https://api.introdb.app/segments";

#[derive(serde::Deserialize)]
struct TvMazeResp {
    externals: Option<Externals>,
}
#[derive(serde::Deserialize)]
struct Externals {
    imdb: Option<String>,
}

#[derive(serde::Deserialize)]
struct Seg {
    start_ms: u64,
    end_ms: u64,
}
#[derive(serde::Deserialize)]
struct SegmentsResp {
    intro: Option<Seg>,
    outro: Option<Seg>,
}

/// Resolves each show's IMDb id and pulls every episode's intro/outro from
/// IntroDB. Missing episodes are simply skipped.
pub async fn fetch_labels(shows: &[ScannedShow]) -> anyhow::Result<Vec<Label>> {
    let client = reqwest::Client::builder()
        .user_agent("butu-markers-bench")
        .build()?;
    let mut labels = Vec::new();

    for show in shows {
        let Some(imdb) = resolve_imdb(&client, &show.title).await else {
            eprintln!("  truth: no IMDb id for '{}' — skipping", show.title);
            continue;
        };
        let mut found = 0usize;
        for ep in &show.episodes {
            if let Some(seg) = fetch_segments(&client, &imdb, ep.season, ep.episode).await {
                if seg.intro.is_some() || seg.outro.is_some() {
                    found += 1;
                }
                labels.push(Label {
                    show: show.title.clone(),
                    season: ep.season,
                    episode: ep.episode,
                    intro: seg.intro.map(|s| [s.start_ms, s.end_ms]),
                    credits: seg.outro.map(|s| [s.start_ms, s.end_ms]),
                });
            }
        }
        eprintln!(
            "  truth: {} ({imdb}) — {found} episodes with markers",
            show.title
        );
    }
    Ok(labels)
}

async fn resolve_imdb(client: &reqwest::Client, title: &str) -> Option<String> {
    let resp: TvMazeResp = client
        .get(TVMAZE)
        .query(&[("q", title)])
        .send()
        .await
        .ok()?
        .json()
        .await
        .ok()?;
    resp.externals?.imdb
}

async fn fetch_segments(
    client: &reqwest::Client,
    imdb: &str,
    season: i32,
    episode: i32,
) -> Option<SegmentsResp> {
    let resp = client
        .get(INTRODB)
        .query(&[
            ("imdb_id", imdb.to_string()),
            ("season", season.to_string()),
            ("episode", episode.to_string()),
        ])
        .send()
        .await
        .ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json().await.ok()
}
