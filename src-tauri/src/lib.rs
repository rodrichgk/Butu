pub mod analysis;
pub mod organize;
pub mod spatial_bridge;
use spatial_bridge::{start_spatial_bridge, BridgeEvent};
use tauri::{Emitter, Window};
use tokio::sync::broadcast;
use tracing::info;
use std::collections::HashMap;

use std::sync::Mutex;

#[derive(Default)]
struct SecurityState {
    allowed_hosts: Mutex<Vec<String>>,
}

#[tauri::command]
fn set_allowed_hosts(state: tauri::State<'_, SecurityState>, hosts: Vec<String>) {
    *state.allowed_hosts.lock().unwrap() = hosts;
}


#[derive(Clone, serde::Serialize)]
struct SpatialCoordsPayload {
    x: f64,
    y: f64,
}

#[derive(Clone, serde::Serialize)]
struct SpatialScrollPayload {
    direction: i32,
}

#[derive(Clone, serde::Serialize)]
struct BridgeStatusPayload {
    connected: bool,
    addr: String,
}

#[tauri::command]
async fn get_ws_port() -> u16 {
    9001
}

/// Guards the generic HTTP-proxy commands. They exist to reach user-configured
/// media servers (Plex/Jellyfin, which legitimately live on localhost/LAN) plus a
/// few public APIs, so we can't use a strict allow-list. We do reject non-HTTP(S)
/// schemes and link-local addresses (169.254.0.0/16 / fe80::/10) — the latter
/// covers the cloud-metadata endpoint (169.254.169.254), a classic SSRF target.
fn guard_proxy_url(url: &str, state: &tauri::State<'_, SecurityState>) -> Result<(), String> {
    let parsed = reqwest::Url::parse(url).map_err(|e| format!("invalid url: {e}"))?;
    if !matches!(parsed.scheme(), "http" | "https") {
        return Err(format!("blocked url scheme: {}", parsed.scheme()));
    }
    
    let allowed = state.allowed_hosts.lock().unwrap().clone();
    if !allowed.is_empty() {
        let mut matched = false;
        for host_str in allowed {
            if url.starts_with(&host_str) {
                matched = true;
                break;
            }
        }
        if !matched {
            return Err("URL does not match configured media servers (SSRF protection)".into());
        }
    }

    if let Some(host) = parsed.host_str() {
        if let Ok(ip) = host.parse::<std::net::IpAddr>() {
            let link_local = match ip {
                std::net::IpAddr::V4(v4) => v4.is_link_local(),
                std::net::IpAddr::V6(v6) => (v6.segments()[0] & 0xffc0) == 0xfe80,
            };
            if link_local {
                return Err("blocked link-local address".into());
            }

            let loopback = ip.is_loopback();
            if loopback {
                let port = parsed.port().unwrap_or(80);
                if port != 32400 && port != 8096 && port != 8920 {
                    return Err("blocked loopback address on non-media port".into());
                }
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn fetch_plex(url: String, headers: HashMap<String, String>, state: tauri::State<'_, SecurityState>) -> Result<String, String> {
    guard_proxy_url(&url, &state)?;
    let client = reqwest::Client::new();
    let mut req = client.get(&url);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    if status < 200 || status >= 300 {
        return Err(format!("HTTP {status}"));
    }
    res.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn fetch_plex_post(url: String, headers: HashMap<String, String>, body: String, state: tauri::State<'_, SecurityState>) -> Result<String, String> {
    guard_proxy_url(&url, &state)?;
    let client = reqwest::Client::new();
    let mut req = client.post(&url).body(body);
    for (k, v) in &headers {
        req = req.header(k.as_str(), v.as_str());
    }
    let res = req.send().await.map_err(|e| e.to_string())?;
    let status = res.status().as_u16();
    if status < 200 || status >= 300 {
        return Err(format!("HTTP {status}"));
    }
    res.text().await.map_err(|e| e.to_string())
}

#[tauri::command]
async fn get_screen_size(window: Window) -> (f64, f64) {
    if let Ok(Some(monitor)) = window.current_monitor() {
        let size = monitor.size();
        return (size.width as f64, size.height as f64);
    }
    (1920.0, 1080.0)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let _ = tracing_subscriber::fmt()
        .with_env_filter("butu=debug,info")
        .try_init();

    info!("Starting Butu — Night");

    let (bridge_tx, _bridge_rx) = broadcast::channel::<BridgeEvent>(256);

    tauri::Builder::default()
        // Shell sidecars (ffmpeg, fpcalc) for the marker auto-detect pipeline.
        .plugin(tauri_plugin_shell::init())
        // Native folder/file picker for the desktop "Organize downloads" tool.
        .plugin(tauri_plugin_dialog::init())
        // Stub plugin so Tauri's ACL recognises "nativePlayer" — the actual
        // implementation lives in Kotlin (NativePlayerPlugin.kt) registered
        // via pluginManager.load() in MainActivity.
        .plugin(tauri::plugin::Builder::<tauri::Wry>::new("native-player").build())
        .setup(move |app| {
            analysis::commands::register(app);
            let app_handle = app.handle().clone();
            let tx = bridge_tx.clone();
            let mut rx = bridge_tx.subscribe();

            let tx_spawn = bridge_tx.clone();
            tauri::async_runtime::spawn(async move {
                start_spatial_bridge(tx_spawn, 1920.0, 1080.0).await;
            });

            tauri::async_runtime::spawn(async move {
                while let Ok(event) = rx.recv().await {
                    match event {
                        BridgeEvent::Coords(coords) => {
                            let _ = app_handle.emit("spatial-coords", SpatialCoordsPayload { x: coords.x, y: coords.y });
                        }
                        BridgeEvent::Click => {
                            let _ = app_handle.emit("spatial-click", ());
                        }
                        BridgeEvent::Scroll(dir) => {
                            if dir == -999 {
                                let _ = app_handle.emit("spatial-back", ());
                            } else {
                                let _ = app_handle.emit("spatial-scroll", SpatialScrollPayload { direction: dir });
                            }
                        }
                        BridgeEvent::Connected(addr) => {
                            let _ = app_handle.emit(
                                "bridge-status",
                                BridgeStatusPayload {
                                    connected: true,
                                    addr: addr.to_string(),
                                },
                            );
                        }
                        BridgeEvent::Disconnected(addr) => {
                            let _ = app_handle.emit(
                                "bridge-status",
                                BridgeStatusPayload {
                                    connected: false,
                                    addr: addr.to_string(),
                                },
                            );
                        }
                    }
                }
            });

            drop(tx);
            Ok(())
        })
        .manage(SecurityState::default())
        .invoke_handler(tauri::generate_handler![
            set_allowed_hosts,
            get_ws_port,
            get_screen_size,
            fetch_plex,
            fetch_plex_post,
            analysis::commands::analyze_library,
            analysis::commands::cancel_analysis,
            analysis::commands::submit_markers,
            organize::commands::organize_plan,
            organize::commands::organize_execute,
            organize::commands::organize_build_rule,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Butu");
}
