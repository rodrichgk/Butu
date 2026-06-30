fn main() {
    // Declare the app's own commands so tauri-build generates an `allow-<cmd>` /
    // `deny-<cmd>` permission for each (referenced from capabilities/default.json).
    tauri_build::try_build(
        tauri_build::Attributes::new().app_manifest(
            tauri_build::AppManifest::new().commands(&[
                "get_ws_port",
                "get_screen_size",
                "fetch_plex",
                "fetch_plex_post",
                "analyze_library",
                "cancel_analysis",
                "submit_markers",
                "organize_plan",
                "organize_execute",
                "organize_build_rule",
            ]),
        ),
    )
    .expect("failed to run tauri-build");
}
