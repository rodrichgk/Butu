//! Throttled local HTTP file server for simulating remote (Plex/Jellyfin)
//! streaming. Serves files from a root directory over HTTP/1 with:
//!   * **Range** support (`206 Partial Content`) — mandatory, because ffmpeg's
//!     `-ss` fast-seek issues byte-range requests; without it the remote code
//!     path isn't exercised (and ffmpeg would refetch from 0).
//!   * a configurable **added latency** per request (simulates RTT).
//!   * an optional **bandwidth cap** (paces the body in chunks).
//!
//! Pointing ffmpeg at `http://127.0.0.1:<port>/<url-encoded rel path>` makes it
//! pull over the loopback exactly as it would from a real server.

use std::convert::Infallible;
use std::io::SeekFrom;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::time::Duration;

use bytes::Bytes;
use http_body_util::combinators::BoxBody;
use http_body_util::{BodyExt, Full, StreamBody};
use hyper::body::{Frame, Incoming};
use hyper::header::{ACCEPT_RANGES, CONTENT_LENGTH, CONTENT_RANGE, CONTENT_TYPE, RANGE};
use hyper::server::conn::http1;
use hyper::service::service_fn;
use hyper::{Request, Response, StatusCode};
use hyper_util::rt::TokioIo;
use percent_encoding::percent_decode_str;
use tokio::io::{AsyncReadExt, AsyncSeekExt};
use tokio::net::TcpListener;
use tokio::task::JoinHandle;

type Body = BoxBody<Bytes, std::io::Error>;

#[derive(Clone, Copy)]
pub struct Throttle {
    pub latency: Duration,
    /// Bandwidth cap in bytes/sec. `None` = unthrottled.
    pub bandwidth_bps: Option<u64>,
}

/// A running netsim server. Drop / [`stop`](NetSim::stop) to shut it down.
pub struct NetSim {
    pub addr: SocketAddr,
    handle: JoinHandle<()>,
}

impl NetSim {
    /// Builds `http://127.0.0.1:<port>/<encoded rel>` for a repo-relative path.
    pub fn url_for(&self, rel: &str) -> String {
        let enc: String = rel
            .split(['/', '\\'])
            .map(|seg| {
                percent_encoding::utf8_percent_encode(seg, percent_encoding::NON_ALPHANUMERIC)
                    .to_string()
            })
            .collect::<Vec<_>>()
            .join("/");
        format!("http://{}/{}", self.addr, enc)
    }

    pub fn stop(self) {
        self.handle.abort();
    }
}

/// Spawns the server on an ephemeral loopback port and returns immediately.
pub async fn spawn(root: PathBuf, throttle: Throttle) -> std::io::Result<NetSim> {
    let listener = TcpListener::bind(("127.0.0.1", 0)).await?;
    let addr = listener.local_addr()?;

    let handle = tokio::spawn(async move {
        loop {
            let (stream, _) = match listener.accept().await {
                Ok(v) => v,
                Err(_) => continue,
            };
            let io = TokioIo::new(stream);
            let root = root.clone();
            tokio::spawn(async move {
                let svc = service_fn(move |req| serve(req, root.clone(), throttle));
                let _ = http1::Builder::new().serve_connection(io, svc).await;
            });
        }
    });

    Ok(NetSim { addr, handle })
}

fn text_response(status: StatusCode, msg: &str) -> Response<Body> {
    let body = Full::new(Bytes::from(msg.to_owned()))
        .map_err(|never| match never {})
        .boxed();
    Response::builder().status(status).body(body).unwrap()
}

async fn serve(
    req: Request<Incoming>,
    root: PathBuf,
    throttle: Throttle,
) -> Result<Response<Body>, Infallible> {
    // Simulate connection/RTT latency before we do anything.
    if !throttle.latency.is_zero() {
        tokio::time::sleep(throttle.latency).await;
    }

    let rel = percent_decode_str(req.uri().path().trim_start_matches('/'))
        .decode_utf8_lossy()
        .into_owned();
    let path = root.join(&rel);

    let meta = match tokio::fs::metadata(&path).await {
        Ok(m) if m.is_file() => m,
        _ => return Ok(text_response(StatusCode::NOT_FOUND, "not found")),
    };
    let size = meta.len();

    // Range handling.
    let range = req
        .headers()
        .get(RANGE)
        .and_then(|v| v.to_str().ok())
        .and_then(|h| parse_range(h, size));

    let (start, end, status) = match range {
        Some((s, e)) => (s, e, StatusCode::PARTIAL_CONTENT),
        None => (0, size.saturating_sub(1), StatusCode::OK),
    };
    let len = end + 1 - start;

    let mut file = match tokio::fs::File::open(&path).await {
        Ok(f) => f,
        Err(_) => {
            return Ok(text_response(
                StatusCode::INTERNAL_SERVER_ERROR,
                "open failed",
            ))
        }
    };
    if file.seek(SeekFrom::Start(start)).await.is_err() {
        return Ok(text_response(
            StatusCode::INTERNAL_SERVER_ERROR,
            "seek failed",
        ));
    }

    let bandwidth = throttle.bandwidth_bps;
    let stream =
        futures_util::stream::unfold((file, len), move |(mut file, remaining)| async move {
            const CHUNK: usize = 64 * 1024;
            if remaining == 0 {
                return None;
            }
            let to_read = remaining.min(CHUNK as u64) as usize;
            let mut buf = vec![0u8; to_read];
            match file.read_exact(&mut buf).await {
                Ok(_) => {
                    if let Some(bps) = bandwidth {
                        if bps > 0 {
                            let secs = to_read as f64 / bps as f64;
                            tokio::time::sleep(Duration::from_secs_f64(secs)).await;
                        }
                    }
                    let frame = Ok(Frame::data(Bytes::from(buf)));
                    Some((frame, (file, remaining - to_read as u64)))
                }
                Err(e) => Some((Err(e), (file, 0))),
            }
        });
    let body = StreamBody::new(stream).boxed();

    let mut builder = Response::builder()
        .status(status)
        .header(ACCEPT_RANGES, "bytes")
        .header(CONTENT_TYPE, "application/octet-stream")
        .header(CONTENT_LENGTH, len);
    if status == StatusCode::PARTIAL_CONTENT {
        builder = builder.header(CONTENT_RANGE, format!("bytes {start}-{end}/{size}"));
    }
    Ok(builder.body(body).unwrap())
}

/// Parses an HTTP `Range` header value against `size`. Supports `bytes=a-b`,
/// `bytes=a-`, and `bytes=-suffix`.
fn parse_range(h: &str, size: u64) -> Option<(u64, u64)> {
    if size == 0 {
        return None;
    }
    let spec = h.trim().strip_prefix("bytes=")?;
    // Only the first range spec is honored (enough for ffmpeg).
    let spec = spec.split(',').next()?.trim();
    let (a, b) = spec.split_once('-')?;
    if a.is_empty() {
        let n: u64 = b.trim().parse().ok()?;
        let n = n.min(size);
        Some((size - n, size - 1))
    } else {
        let start: u64 = a.trim().parse().ok()?;
        let end = if b.trim().is_empty() {
            size - 1
        } else {
            b.trim().parse::<u64>().ok()?.min(size - 1)
        };
        if start > end {
            return None;
        }
        Some((start, end))
    }
}
