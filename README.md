<div align="center">

# Butu

**Your Plex & Jellyfin libraries, in one beautiful player — at home, anywhere, and on every screen.**

[**Try it on the web →**](https://butu.fr) · Android TV · Windows desktop

Free &amp; open-source. Built on top of *your own* Plex or Jellyfin server.

</div>

---

## What is Butu?

Butu is a media **client** — a polished, focus-first player that connects to your existing **Plex** or **Jellyfin** server and plays your movies, shows, and music. It doesn't host or provide any content itself; your library, your server, your rules.

- **Plex & Jellyfin** — sign in with a QR code, password, or token. No IP addresses to hunt down.
- **Watch anywhere** — at home or off-network. Libraries a friend **shares** with you stream straight through (via Plex's relay when needed).
- **Cinematic playback** — auto-skip intros & credits, **Boost Voices** (dialogue lifted above effects), and clean burned-in subtitles.
- **Made for every screen** — a 10-foot D-pad UI on Android TV, plus desktop and web.
- **Private by design** — your credentials stay on your device; Butu talks directly to your server.
- **English & French** — UI follows your browser/device language.

## Get Butu

| Platform | Status | How |
|---|---|---|
| **Web** | ✅ Live | [butu.fr](https://butu.fr) — just connect your server |
| **Windows** | 🔜 | Desktop app (Tauri) — see [Releases](../../releases) |
| **Android TV / phone** | 🔜 | Sideload the APK — see [Releases](../../releases) |

## How it works

1. **Connect** your Plex or Jellyfin server (QR / password / token).
2. Your **library appears** automatically — artwork, metadata, and resume points.
3. **Watch** at home or anywhere, on TV, desktop, or the web.

> Web note: the browser version works great with **Plex** (it reaches your server over Plex's HTTPS `*.plex.direct` connections, including relay). **Jellyfin** in the browser needs your server reachable over HTTPS; the native apps handle any server directly.

## Tech stack

- **Web & desktop UI** — React + TypeScript + Vite + Tailwind + Framer Motion (`src/`)
- **Desktop shell** — Tauri (Rust), incl. a local intro/credits **marker-detection** pipeline (`src-tauri/`)
- **Android TV app** — native Kotlin + Jetpack Compose for TV + Media3/ExoPlayer (`android/`)
- **Crowdsourced markers** — Supabase Edge Function (`cloud/`)
- **Localization** — i18next (EN/FR) on web, Android resource qualifiers on TV

## Project structure

```
butu/
├── src/                 # React/TS frontend (web + Tauri desktop)
│   ├── components/      # UI: Landing, MediaSetup, ButuPlayer, MediaStage, …
│   ├── services/        # plexApi.ts, jellyfinApi.ts, markerService.ts
│   ├── store/           # Zustand state
│   └── locales/         # en.json, fr.json
├── src-tauri/           # Rust/Tauri desktop backend + marker analysis
├── android/             # Native Kotlin Android TV app (Jetpack Compose)
├── cloud/               # Supabase edge function (marker DB)
└── air-mouse/           # Companion phone web remote (experimental)
```

## Build & run

Requires Node 18+. Copy `.env.example` to `.env` if you want dev auto-login (optional).

**Web**
```bash
npm install
npm run dev      # local dev server
npm run build    # production build → dist/
```

**Windows desktop (Tauri)** — needs the Rust toolchain.
```bash
npm run tauri dev
npm run tauri build   # produces an installer under src-tauri/target/release/bundle/
```

**Android TV** — needs the Android SDK (`android/local.properties` → `sdk.dir`).
```bash
cd android
./gradlew installDebug    # build + install to a connected device
./gradlew assembleRelease # signed release (needs keystore.properties — see keystore.properties.example)
```

## Privacy

Butu stores your server credentials locally and connects **directly** to your media server. The only optional call to Butu's own infrastructure is the crowdsourced intro/credits marker database (no account, no personal data).

## Support

Butu is free. If it's useful and you'd like to support development, a donate option appears in the app once it's set up — but you never have to.

## Credits

Built by **Gabhy Rodrich** — Master's in Electronics & Automation.
