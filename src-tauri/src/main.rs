#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod spatial_bridge;

use spatial_bridge::{start_spatial_bridge, BridgeEvent};
use tauri::{Manager, Window};
use tokio::sync::broadcast;
use tracing::info;

#[derive(Clone, serde::Serialize)]
struct SpatialCoordsPayload {
    x: f64,
    y: f64,
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

#[tauri::command]
async fn get_screen_size(window: Window) -> (f64, f64) {
    if let Ok(monitor) = window.current_monitor() {
        if let Some(monitor) = monitor {
            let size = monitor.size();
            return (size.width as f64, size.height as f64);
        }
    }
    (1920.0, 1080.0)
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter("butu=debug,info")
        .init();

    info!("Starting Butu — Night");

    let (bridge_tx, _bridge_rx) = broadcast::channel::<BridgeEvent>(256);

    tauri::Builder::default()
        .setup(move |app| {
            let app_handle = app.handle();
            let tx = bridge_tx.clone();
            let mut rx = bridge_tx.subscribe();

            let tx_spawn = bridge_tx.clone();
            tokio::spawn(async move {
                start_spatial_bridge(tx_spawn, 1920.0, 1080.0).await;
            });

            tokio::spawn(async move {
                while let Ok(event) = rx.recv().await {
                    match event {
                        BridgeEvent::Coords(coords) => {
                            let _ = app_handle.emit_all(
                                "spatial-coords",
                                SpatialCoordsPayload {
                                    x: coords.x,
                                    y: coords.y,
                                },
                            );
                        }
                        BridgeEvent::Click => {
                            let _ = app_handle.emit_all("spatial-click", ());
                        }
                        BridgeEvent::Scroll(dir) => {
                            let _ = app_handle.emit_all("spatial-scroll", dir);
                        }
                        BridgeEvent::Connected(addr) => {
                            let _ = app_handle.emit_all(
                                "bridge-status",
                                BridgeStatusPayload {
                                    connected: true,
                                    addr: addr.to_string(),
                                },
                            );
                        }
                        BridgeEvent::Disconnected(addr) => {
                            let _ = app_handle.emit_all(
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
        .invoke_handler(tauri::generate_handler![get_ws_port, get_screen_size])
        .run(tauri::generate_context!())
        .expect("error while running Butu");
}
