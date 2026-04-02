# Butu — Night

> *Butu* (Lingala): Night. A high-performance, TV-optimized cinematic media client.

## Architecture

```
butu/
├── src/                        # React + TypeScript frontend
│   ├── components/
│   │   ├── LiquidCursor.tsx    # Glowing spatial cursor with magnetic snapping
│   │   ├── NavigationSidebar.tsx # Glassmorphism collapsible sidebar
│   │   ├── HeroCarousel.tsx    # Full-bleed editorial hero with 600ms transitions
│   │   ├── MediaStage.tsx      # Horizontal scroll stage (spacing-20 margins)
│   │   ├── MediaCard.tsx       # Universal geometry cards (2:3 / 1:1 / 16:9)
│   │   └── ButuPlayer.tsx      # Custom player with glass seek-bar + ambient lighting
│   ├── hooks/
│   │   ├── useSpatialCursor.ts # RAF-based cursor smoothing + magnetic snap logic
│   │   └── useWebSocketBridge.ts # WS client → IMU coord pipeline
│   ├── store/useButuStore.ts   # Zustand global state
│   ├── data/mockLibrary.ts     # Sample media library (Movies/Music/TV)
│   └── types/index.ts          # Shared TypeScript types
├── src-tauri/                  # Rust + Tauri backend
│   └── src/
│       ├── main.rs             # Tauri app entry, event bridge
│       └── spatial_bridge.rs  # WebSocket server + Kalman IMU smoother
├── air-mouse/
│   └── index.html              # Mobile web Air Mouse (Gyroscope + Touchpad mode)
└── DESIGN.md                   # Design system specification
```

## Design System — Butu Cinematic Aperture

| Token | Value | Use |
|---|---|---|
| `surface` | `#0c0e13` | Base UI background |
| `primary` / Teal Neon Aura | `#99f7ff` | Focus states, cursor, accents |
| `primary_container` | `#00f1fe` | CTA buttons |
| Glassmorphism | 60% opacity, 40px blur | All overlays & sidebars |
| Neon Focus | 40px blur, 15% opacity | Card & element focus glow |

**Fonts:** Plus Jakarta Sans (display) · Manrope (body) · Space Grotesk (technical metadata)

## Running

### Frontend dev server (standalone, no Tauri)
```bash
npm install
npm run dev
```
Open [http://localhost:1420](http://localhost:1420)

### Full Tauri app
> Requires [Rust](https://rustup.rs) + [Tauri CLI prerequisites](https://tauri.app/v1/guides/getting-started/prerequisites)
```bash
npm install
npm run tauri dev
```

### Air Mouse
Open `air-mouse/index.html` on your mobile browser (must be on same LAN as the TV).  
Enter the TV host IP, grant gyroscope permission, and tilt to control the cursor.

The Rust `SpatialBridge` listens on **ws://0.0.0.0:9001** for incoming IMU data.

## Key Features

- **Liquid Cursor** — Soft glowing dot with Kalman-smoothed tracking and magnetic snapping (120px radius, 1.1× scale + Teal Neon Aura on snap)
- **SpatialBridge.rs** — Rust WebSocket server with Kalman filter for IMU noise reduction, maps β/γ → screen XY
- **MediaStage** — Horizontal scroll with `spacing-20` margins, staggered entry animations
- **Universal Geometry** — DVD posters (2:3), album art (1:1), TV thumbnails (16:9)
- **ButuPlayer** — Glass seek-bar, ambient color lighting from content, keyboard shortcuts (Space/←/→/Esc)
- **Air Mouse** — Dual mode: Gyroscope (Web Sensors API) + Touchpad fallback
- **10-Foot UI** — 4K-legible typography, neon focus states visible from 10 feet, no dividers
