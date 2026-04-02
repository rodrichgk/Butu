use futures_util::{SinkExt, StreamExt};
use serde::{Deserialize, Serialize};
use std::net::SocketAddr;
use std::sync::Arc;
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::broadcast;
use tokio_tungstenite::{accept_async, tungstenite::Message};
use tracing::{error, info, warn};

const WS_PORT: u16 = 9001;
const KALMAN_Q: f64 = 0.001;
const KALMAN_R: f64 = 0.1;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImuData {
    pub alpha: f64,
    pub beta: f64,
    pub gamma: f64,
    pub timestamp: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "data")]
pub enum SpatialMessage {
    #[serde(rename = "imu")]
    Imu(ImuData),
    #[serde(rename = "click")]
    Click,
    #[serde(rename = "scroll")]
    Scroll { direction: i32 },
    #[serde(rename = "ping")]
    Ping,
}

#[derive(Debug, Clone, Serialize)]
pub struct ScreenCoords {
    pub x: f64,
    pub y: f64,
    pub snapped: bool,
}

struct KalmanFilter {
    x: f64,
    p: f64,
    q: f64,
    r: f64,
}

impl KalmanFilter {
    fn new(initial: f64) -> Self {
        Self {
            x: initial,
            p: 1.0,
            q: KALMAN_Q,
            r: KALMAN_R,
        }
    }

    fn update(&mut self, measurement: f64) -> f64 {
        self.p += self.q;
        let k = self.p / (self.p + self.r);
        self.x += k * (measurement - self.x);
        self.p *= 1.0 - k;
        self.x
    }
}

pub struct ImuSmoother {
    beta_filter: KalmanFilter,
    gamma_filter: KalmanFilter,
    screen_width: f64,
    screen_height: f64,
}

impl ImuSmoother {
    pub fn new(screen_width: f64, screen_height: f64) -> Self {
        Self {
            beta_filter: KalmanFilter::new(0.0),
            gamma_filter: KalmanFilter::new(0.0),
            screen_width,
            screen_height,
        }
    }

    pub fn process(&mut self, imu: &ImuData) -> ScreenCoords {
        let smooth_beta = self.beta_filter.update(imu.beta);
        let smooth_gamma = self.gamma_filter.update(imu.gamma);

        let clamped_gamma = smooth_gamma.clamp(-45.0, 45.0);
        let clamped_beta = (smooth_beta - 45.0).clamp(-45.0, 45.0);

        let x = ((clamped_gamma + 45.0) / 90.0) * self.screen_width;
        let y = ((clamped_beta + 45.0) / 90.0) * self.screen_height;

        ScreenCoords {
            x: x.clamp(0.0, self.screen_width),
            y: y.clamp(0.0, self.screen_height),
            snapped: false,
        }
    }
}

#[derive(Debug, Clone)]
pub enum BridgeEvent {
    Coords(ScreenCoords),
    Click,
    Scroll(i32),
    Connected(SocketAddr),
    Disconnected(SocketAddr),
}

pub async fn start_spatial_bridge(
    event_tx: broadcast::Sender<BridgeEvent>,
    screen_width: f64,
    screen_height: f64,
) {
    let addr = format!("0.0.0.0:{}", WS_PORT);

    let listener = match TcpListener::bind(&addr).await {
        Ok(l) => {
            info!("SpatialBridge listening on ws://{}", addr);
            l
        }
        Err(e) => {
            error!("SpatialBridge failed to bind: {}", e);
            return;
        }
    };

    let event_tx = Arc::new(event_tx);
    let sw = screen_width;
    let sh = screen_height;

    loop {
        match listener.accept().await {
            Ok((stream, addr)) => {
                info!("Air Mouse connected from {}", addr);
                let tx = Arc::clone(&event_tx);
                let _ = tx.send(BridgeEvent::Connected(addr));

                tokio::spawn(handle_connection(stream, addr, tx, sw, sh));
            }
            Err(e) => {
                warn!("Accept error: {}", e);
            }
        }
    }
}

async fn handle_connection(
    stream: TcpStream,
    addr: SocketAddr,
    event_tx: Arc<broadcast::Sender<BridgeEvent>>,
    screen_width: f64,
    screen_height: f64,
) {
    let ws_stream = match accept_async(stream).await {
        Ok(ws) => ws,
        Err(e) => {
            warn!("WebSocket handshake failed for {}: {}", addr, e);
            return;
        }
    };

    info!("WebSocket session established for {}", addr);
    let (mut ws_sender, mut ws_receiver) = ws_stream.split();
    let mut smoother = ImuSmoother::new(screen_width, screen_height);

    let welcome = serde_json::json!({
        "type": "welcome",
        "data": { "server": "SpatialBridge", "version": "0.1.0" }
    });
    let _ = ws_sender
        .send(Message::Text(welcome.to_string()))
        .await;

    while let Some(msg) = ws_receiver.next().await {
        match msg {
            Ok(Message::Text(text)) => {
                match serde_json::from_str::<SpatialMessage>(&text) {
                    Ok(SpatialMessage::Imu(imu)) => {
                        let coords = smoother.process(&imu);
                        let _ = event_tx.send(BridgeEvent::Coords(coords));
                    }
                    Ok(SpatialMessage::Click) => {
                        let _ = event_tx.send(BridgeEvent::Click);
                    }
                    Ok(SpatialMessage::Scroll { direction }) => {
                        let _ = event_tx.send(BridgeEvent::Scroll(direction));
                    }
                    Ok(SpatialMessage::Ping) => {
                        let pong = serde_json::json!({ "type": "pong" });
                        let _ = ws_sender
                            .send(Message::Text(pong.to_string()))
                            .await;
                    }
                    Err(e) => {
                        warn!("Failed to parse message from {}: {}", addr, e);
                    }
                }
            }
            Ok(Message::Close(_)) => {
                info!("Air Mouse disconnected: {}", addr);
                break;
            }
            Ok(Message::Ping(data)) => {
                let _ = ws_sender.send(Message::Pong(data)).await;
            }
            Err(e) => {
                warn!("WebSocket error from {}: {}", addr, e);
                break;
            }
            _ => {}
        }
    }

    let _ = event_tx.send(BridgeEvent::Disconnected(addr));
    info!("Session cleaned up for {}", addr);
}
