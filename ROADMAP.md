# Butu — Roadmap to Launch

> Goal: ship a useful **v1 first**, improve the rest later. This doc is the "when do we stop and ship" line.

## Products (settled)

| Target | Tech | Role | First release |
|---|---|---|---|
| **Android TV** (phones later) | Native Kotlin (`dev.butu`) | **Flagship** | v1.0 |
| **Windows desktop** | Tauri (React/TS) | Companion | v1.1 |
| Phone remote | `air-mouse` web app | Accessory | as-is |

There is **one** Android app (native Kotlin). The Tauri **Android** build (`com.butu.app`) is a stray byproduct of Tauri's tooling — **not a product**; it gets removed (see Phase 0).

## Decisions (locked)

- [x] **Distribution**: **both** — self-hosted **APK on the Butu website** (also hosts the Tauri desktop download) *and* **Play Store**. APK self-host is the fast path; Play Store trails by the listing/privacy-policy work.
- [x] **Version**: stay on **`0.1.0`** (`versionCode 1`) for first public release.
- [x] **Desktop**: companion → **v1.1**.
- [x] **Release signing**: gitignored `keystore.properties` → wired (see Phase 0).

---

## v1.0 — the ship line

**What v1 is:** a Plex media player for Android TV — IP-less login (PIN/QR), owned + shared libraries via plex.tv discovery/relay, browse, play with Boost-Voices audio + burned subtitles, resume / Continue Watching, intro/credits auto-skip. **This already works.** v1 is about de-risking and packaging, not new features.

### Phase 0 — Ship blockers (do these, then ship)
- [x] Remove stray Tauri-Android target — removed `src-tauri/gen/android/`, `src-tauri/tauri.android.conf.json`, and the Tauri-Android `deploy.ps1`; `deploy-tv.ps1` now builds/installs/launches the **native** app. Tauri = desktop only.
- [ ] Deploy the current native build to the TV and **soak-test end-to-end**: setup → browse → play → change subtitle → change audio → back out → resume → next title → settings toggles. No crashes. *(Pending: transport-centering + B-icon changes are built but undeployed — TV was off.)*
- [x] **Strip dev Plex credentials from release** — release build now blanks `PLEX_TOKEN`/`PLEX_SERVER_URL` (build.gradle.kts) and the dev auto-login is gated to `BuildConfig.DEBUG` (MainActivity). *Was a real leak: the dev token baked into the APK + every user auto-connecting to the dev's server.* `SUPABASE_ANON_KEY` stays (public by design).
- [x] **Wire release signing** — `signingConfigs.release` reads gitignored `keystore.properties` (passwords out of source); release build references it; unsigned fallback if absent. Keystore password changed from the placeholder to the real strong password (PKCS12 → store == key password). `signingReport` confirms it resolves `butu-release.keystore` (valid to 2053). Hardened `.gitignore` (`*.keystore`, `keystore.properties`, `*.apk/.aab/.idsig`, Android build dirs).
- [x] **Version**: staying on `0.1.0` / `versionCode 1` (decided).
- [ ] **Produce + verify release artifacts**: `bundleRelease` (AAB for Play) and `assembleRelease` (signed APK for the site). Smoke-test the **release** build on the TV — proguard/shrink can break things debug doesn't.
- [ ] **Website**: host the signed APK + Tauri desktop download.
- [ ] **Play Store**: privacy policy, content rating, listing assets, target-API compliance (can trail the APK launch).
- [ ] Quiet `DebugLogger` in release (writes a log file + logcat; gate to `BuildConfig.DEBUG`). Small footprint (4 files).
- [ ] **Set the real donation link** — UI is done (a **QR "Support Butu" screen** on Android TV, since TVs have no browser; a **QR + clickable link** modal on desktop). Just replace the `DONATE_URL` placeholder (`https://example.com/donate`) in `HomeScreen.kt` + `App.tsx`. Website can use a standard link + QR.
- [x] Final secret sweep — `.env` gitignored ✓, token test-files removed ✓, dev creds stripped from release ✓, keystore + passwords gitignored ✓.

→ **Ship after Phase 0. This is the "stop" line.**

---

## v1.1 — Fast-follow (weeks after)
- [ ] **Windows desktop release**: verify the untested bits (autoplay, subtitle CC menu), wire `hls.js` if HLS playback is shaky, then sign + package.
- [ ] **Jellyfin parity verification** (markers / intro-skip end-to-end on Jellyfin).
- [ ] **Sharing UX hints**: "Shared by \<owner\>" label + a "Relay (slower)" badge on the server picker.
- [ ] **Play Store submission** if v1 was sideload (privacy policy, listing, content rating).
- [ ] **First-run onboarding** explaining the Plex sharing model (owner shares via Plex → appears automatically).

## v2 — Later
Phone/tablet layouts · search · watchlist · multi-user profiles · downloads/offline · CI + smoke tests · marker-DB moderation at scale · native "share to a friend".

## Explicit cut line — NOT in v1 (saying no on purpose)
Desktop, phone UI, Jellyfin-as-first-class, search, profiles, Play Store, automated tests. None block a useful Android TV launch.

---

## Status of recent work (context)
- **Done & in code:** Boost-Voices downmix (Android Plex+Jellyfin, desktop) as a Settings toggle · subtitle burn-in (Plex + Jellyfin Android) · track-menu focus + focus-trap fixes · transcode stall watchdog + incomplete-segments fast start · home focus-crash fix · Continue Watching (Android) · settings overhaul (both) · desktop autoplay + subtitle CC menu (TS, runtime-unverified) · B-logo launcher icon + TV banner (Android).
- **Built but undeployed (TV offline):** native Android build with transport-control centering + B icon.
