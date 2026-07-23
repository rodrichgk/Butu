import type { MediaItem } from "../types";

// ─── Guest mode / demo library ─────────────────────────────────────────────
//
// Real, legally-clean, freely-licensed content so a visitor can actually click
// Play and watch something — not just look at a mocked-up grid. Every item
// below was individually verified (curl -I) for a real 200/206 response,
// correct content-type, and Accept-Ranges: bytes (so seeking works) before
// being added — and every license claim in a comment was confirmed against
// the item's own metadata (archive.org `licenseurl` / Commons `extmetadata`),
// not assumed. No TMDB/studio key art, no scraped subtitles, nothing that
// needs a takedown-risk judgment call.
//
//   Movies   — Blender Foundation "open movies", CC BY 3.0/4.0.
//              https://www.blender.org/about/projects/
//   TV       — Caminandes (same Blender Foundation project), CC BY.
//   Anime    — Pepper&Carrot motion comic by the Morevna Project, an
//              animated adaptation of David Revoy's webcomic, CC BY-SA 3.0/4.0.
//              https://morevnaproject.org/
//   Manga    — Pepper&Carrot itself (the source webcomic), by David Revoy,
//              CC BY 4.0 — confirmed directly on peppercarrot.com/en/about.
//              No reader in this app (manga is cover+metadata only, see
//              ContentDetailPage's `item.type !== "manga"` check), so these
//              are just real, correctly-licensed cover art + synopses.
//   Music    — a mix of CC-BY(-SA) netlabel musicians (Broke For Free,
//              Jahzzar) and the Blender Foundation's own film scores
//              (Tears of Steel OST, CC BY-ND — used unmodified, which
//              BY-ND permits).
//
// Video/audio files are served directly from the Internet Archive
// (archive.org); poster/cover art from Wikimedia Commons
// (upload.wikimedia.org/wikipedia/commons/..., NOT the fair-use
// /wikipedia/en/ namespace) or archive.org's own official uploads.

export const demoLibrary: MediaItem[] = [
  {
    id: "demo-ed",
    title: "Elephants Dream",
    type: "movie",
    thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/ElephantsDreamPoster.jpg/1280px-ElephantsDreamPoster.jpg",
    backdropUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/ElephantsDreamPoster.jpg/1280px-ElephantsDreamPoster.jpg",
    year: 2006,
    duration: 654,
    genre: ["Sci-Fi", "Surreal", "Short Film"],
    description: "Two characters wander a vast, dreamlike machine — one certain he knows the way out, the other quietly unraveling. The first film ever made entirely in Blender, and the project that kicked off the open-movie tradition.",
    resolution: "720p",
    codec: "H.264",
    bitrate: "0.9 Mbps",
    streamUrl: "https://archive.org/download/ElephantsDream_628/ElephantsDream_720p_DivXPlus_512kb.mp4",
    ambientColor: "#3a6b7a",
  },
  {
    id: "demo-bbb",
    title: "Big Buck Bunny",
    type: "movie",
    thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/1280px-Big_buck_bunny_poster_big.jpg",
    backdropUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Big_buck_bunny_poster_big.jpg/1280px-Big_buck_bunny_poster_big.jpg",
    year: 2008,
    duration: 596,
    genre: ["Comedy", "Animation", "Short Film"],
    description: "A giant, easygoing rabbit puts up with the local rodents' pranks — right up until they push their luck too far. Slapstick revenge, rendered entirely in open-source software.",
    resolution: "480p",
    codec: "H.264",
    bitrate: "0.6 Mbps",
    streamUrl: "https://archive.org/download/big-buck-bunny-512kb_202601/BigBuckBunny_512kb.mp4",
    ambientColor: "#5a9c3a",
  },
  {
    id: "demo-sintel",
    title: "Sintel",
    type: "movie",
    thumbnail: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg",
    backdropUrl: "https://upload.wikimedia.org/wikipedia/commons/8/8f/Sintel_poster.jpg",
    year: 2010,
    duration: 888,
    genre: ["Fantasy", "Adventure", "Short Film"],
    description: "A lone woman crosses a war-scarred fantasy world searching for the baby dragon she once raised and lost. Blender's third open movie, and the one that proved the toolchain could carry real emotional weight.",
    resolution: "480p",
    codec: "H.264",
    bitrate: "0.7 Mbps",
    streamUrl: "https://archive.org/download/Sintel/sintel-2048-stereo_512kb.mp4",
    ambientColor: "#c46a2a",
  },
  {
    id: "demo-tos",
    title: "Tears of Steel",
    type: "movie",
    thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Tos-poster.png/1280px-Tos-poster.png",
    backdropUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Tos-poster.png/1280px-Tos-poster.png",
    year: 2012,
    duration: 734,
    genre: ["Sci-Fi", "Action", "Short Film"],
    description: "A small band of warriors and scientists gathers among Amsterdam's ruins to make peace with a rogue army of robots. Blender's first attempt at blending live-action footage with visual effects, shot on a real city street.",
    resolution: "1080p",
    codec: "H.264",
    bitrate: "0.9 Mbps",
    streamUrl: "https://archive.org/download/tears-of-steel_202601/Tears%20of%20Steel.mp4",
    ambientColor: "#4a5568",
  },
  {
    id: "demo-cosmos",
    title: "Cosmos Laundromat: First Cycle",
    type: "movie",
    thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/CosmosLaundromatPoster.jpg/1280px-CosmosLaundromatPoster.jpg",
    backdropUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/CosmosLaundromatPoster.jpg/1280px-CosmosLaundromatPoster.jpg",
    year: 2015,
    duration: 731,
    genre: ["Comedy", "Sci-Fi", "Short Film"],
    description: "A suicidal sheep named Franck gets a very unwanted second chance at life, courtesy of a stranger with her own tangled agenda. A darkly funny detour into the multiverse, told with full Cycles-rendered visuals.",
    resolution: "1080p",
    codec: "H.264",
    bitrate: "2.4 Mbps",
    streamUrl: "https://archive.org/download/cosmos-laundromat-first-cycle_202601/Cosmos%20Laundromat%20-%20First%20Cycle.mp4",
    ambientColor: "#7a4a9c",
  },
  {
    id: "demo-spring",
    title: "Spring",
    type: "movie",
    thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Spring2019PillarPosterBlender.jpg/1280px-Spring2019PillarPosterBlender.jpg",
    backdropUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Spring2019PillarPosterBlender.jpg/1280px-Spring2019PillarPosterBlender.jpg",
    year: 2019,
    duration: 446,
    genre: ["Fantasy", "Animation", "Short Film"],
    description: "A shepherdess and her wolf guide their flock through a mountain pass, until a fading nature spirit asks one last favor of her. A quiet, painterly short built to showcase Blender's then-new Eevee real-time renderer.",
    resolution: "720p",
    codec: "H.264",
    bitrate: "0.9 Mbps",
    streamUrl: "https://archive.org/download/spring_blenderopenmovie/Spring%20-%20Blender%20Open%20Movie%20-%20YouTube.mp4",
    ambientColor: "#3a8c6a",
  },
  {
    id: "demo-caminandes",
    title: "Caminandes",
    type: "tv",
    thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Pablo_Vazquez_-_Caminandes_-_Episode_1_-_Llama_Drama_-_Cover_thumbnail.png/1280px-Pablo_Vazquez_-_Caminandes_-_Episode_1_-_Llama_Drama_-_Cover_thumbnail.png",
    backdropUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/6/61/Pablo_Vazquez_-_Caminandes_-_Episode_1_-_Llama_Drama_-_Cover_thumbnail.png/1280px-Pablo_Vazquez_-_Caminandes_-_Episode_1_-_Llama_Drama_-_Cover_thumbnail.png",
    year: 2013,
    duration: 210,
    genre: ["Comedy", "Animation", "Family"],
    description: "Koro the llama just wants to get down the road — but a stubborn rock, a trio of armored armadillos, and a long-awaited travel companion all have other ideas. Three short, self-contained cartoons made to demo Blender's animation tools.",
    resolution: "1080p",
    codec: "H.264",
    bitrate: "4.7 Mbps",
    season: 1,
    episode: 3,
    ambientColor: "#c48a3a",
    episodes: [
      {
        id: "demo-cam-1",
        season: 1,
        episode: 1,
        title: "Llama Drama",
        duration: 71,
        description: "Koro the llama meets his match: a boulder that refuses to move out of the road.",
        streamUrl: "https://archive.org/download/Caminandes1LlamaDrama/01_llama_drama_1080p.mp4",
      },
      {
        id: "demo-cam-2",
        season: 1,
        episode: 2,
        title: "Gran Dillama",
        duration: 200,
        description: "A tempting piece of fruit puts Koro at odds with three very territorial armadillos.",
        streamUrl: "https://archive.org/download/Caminandes2GranDillama/02_gran_dillama_1080p.mp4",
      },
      {
        id: "demo-cam-3",
        season: 1,
        episode: 3,
        title: "Llamigos",
        duration: 210,
        description: "Koro's solo journey finally gets a travel companion — if he can shake off his old habits.",
        streamUrl: "https://archive.org/download/CaminandesLlamigos/Caminandes_%20Llamigos-1080p.mp4",
      },
    ],
  },

  // ─── Anime ────────────────────────────────────────────────────────────────
  // Pepper&Carrot Motion Comic — the Morevna Project's animated adaptation of
  // David Revoy's webcomic. Episode numbers match the source webcomic
  // chapters (3, 4, 6); not every chapter has a motion-comic adaptation, so
  // the numbering isn't consecutive — that's accurate, not a bug.
  {
    id: "demo-peppercarrot-anime",
    title: "Pepper & Carrot",
    type: "anime",
    thumbnail: "https://archive.org/download/peppercarrot-ep6/poster-1-h3-final-en.jpg",
    backdropUrl: "https://archive.org/download/peppercarrot-ep6/poster-1-h3-final-en.jpg",
    year: 2015,
    duration: 455,
    genre: ["Fantasy", "Comedy", "Adventure"],
    description: "A young witch's apprentice and her cat navigate rival magicians, potion contests, and the everyday chaos of Hereva. An animated adaptation of David Revoy's webcomic, produced by the Morevna Project's open-source animation team.",
    resolution: "1080p",
    codec: "H.264",
    bitrate: "4.2 Mbps",
    season: 1,
    episode: 6,
    ambientColor: "#8a4a9c",
    episodes: [
      {
        id: "demo-pc-3",
        season: 1,
        episode: 3,
        title: "The Secret Ingredients",
        duration: 205,
        description: "Pepper goes to the market, learns about the upcoming Potion Contest, and searches for the secret ingredients.",
        streamUrl: "https://archive.org/download/pepper-carrot-episode-3-the-secret-ingredients-english/79780d2c-419b-42a3-adb5-85ae2aea4d1e-1080.mp4",
      },
      {
        id: "demo-pc-4",
        season: 1,
        episode: 4,
        title: "Stroke of Genius",
        duration: 215,
        description: "Pepper's confidence takes a hit when her potion-making doesn't go as planned.",
        streamUrl: "https://archive.org/download/pepper-carrot-episode-4-stroke-of-genius-1080p/Pepper%20%26%20Carrot%20Episode%204%3A%20Stroke%20of%20Genius%201080p.mp4",
      },
      {
        id: "demo-pc-6",
        season: 1,
        episode: 6,
        title: "The Potion Contest",
        duration: 455,
        description: "Pepper travels to Komona Island to compete in the Potion Contest against far more experienced rivals.",
        streamUrl: "https://archive.org/download/peppercarrot-ep6/pepper-en-basic.mp4",
      },
    ],
  },

  // ─── Manga ─────────────────────────────────────────────────────────────────
  // Pepper&Carrot's own source webcomic. This app has no manga reader — these
  // are cover art + synopsis only (see ContentDetailPage's manga check),
  // exactly like the animated adaptation above but for the original comic.
  {
    id: "demo-manga-ep1",
    title: "Pepper & Carrot — The Potion of Flight",
    type: "manga",
    thumbnail: "https://archive.org/download/169PeppercarrotWallpapersByDavidRevoy/Episode-1_peppercarrot-wallpaper_by-David-Revoy.jpg",
    year: 2014,
    genre: ["Fantasy", "Comedy", "Webcomic"],
    description: "Episode 1 of David Revoy's webcomic: Pepper brews a flying potion for a client with more urgent business than she expects. The comic that started it all — free and CC-licensed from day one.",
    ambientColor: "#5a9c8a",
  },
  {
    id: "demo-manga-ep2",
    title: "Pepper & Carrot — Rainbow Potions",
    type: "manga",
    thumbnail: "https://archive.org/download/169PeppercarrotWallpapersByDavidRevoy/Episode-2_peppercarrot-wallpaper_by-David-Revoy.jpg",
    year: 2014,
    genre: ["Fantasy", "Comedy", "Webcomic"],
    description: "Episode 2: the arrogant magician Braise challenges Pepper to a very public potion-making contest — and underestimates her completely.",
    ambientColor: "#9c5a8a",
  },
  {
    id: "demo-manga-ep7",
    title: "Pepper & Carrot — The Wish",
    type: "manga",
    thumbnail: "https://archive.org/download/169PeppercarrotWallpapersByDavidRevoy/Episode-7_peppercarrot-wallpaper_by-David-Revoy.jpg",
    year: 2015,
    genre: ["Fantasy", "Comedy", "Webcomic"],
    description: "Episode 7: a shooting star grants Carrot the cat a single wish, with predictably chaotic consequences for Pepper's household.",
    ambientColor: "#8a9c5a",
  },

  // ─── Music ─────────────────────────────────────────────────────────────────
  // CC-BY(-SA) netlabel musicians, plus the Blender Foundation's own film
  // scores. Bitrates below are computed from each file's real size/duration
  // (both taken from the file's own archive.org metadata), not invented.
  {
    id: "demo-music-1",
    title: "As Colourful As Ever",
    type: "music",
    thumbnail: "https://archive.org/download/BrokeForFreeLayers/cover.jpg",
    year: 2012,
    duration: 234,
    genre: ["Electronic", "Downtempo"],
    description: "Opening track from \"Layers\", released under CC BY 3.0 — a staple of the Creative Commons netlabel scene.",
    artist: "Broke For Free",
    album: "Layers",
    trackNumber: 1,
    codec: "MP3",
    bitrate: "180 kbps",
    streamUrl: "https://archive.org/download/BrokeForFreeLayers/Broke%20For%20Free%20-%20Layers%20-%2001%20As%20Colourful%20As%20Ever.mp3",
    ambientColor: "#3a8ca0",
  },
  {
    id: "demo-music-2",
    title: "Night Owl",
    type: "music",
    thumbnail: "https://archive.org/download/Directionless_EP-8295/Directionless_EP-8295.jpg",
    year: 2011,
    duration: 194,
    genre: ["Electronic", "Chillhop"],
    description: "Opening track from the \"Directionless EP\", released under CC BY 3.0.",
    artist: "Broke For Free",
    album: "Directionless EP",
    trackNumber: 1,
    codec: "MP3",
    bitrate: "330 kbps",
    streamUrl: "https://archive.org/download/Directionless_EP-8295/Broke_For_Free_-_01_-_Night_Owl.mp3",
    ambientColor: "#4a7a9c",
  },
  {
    id: "demo-music-3",
    title: "Intruder",
    type: "music",
    thumbnail: "https://archive.org/download/Jahzzar-Bunk/cover.jpg",
    year: 2012,
    duration: 292,
    genre: ["Rock", "Instrumental"],
    description: "Opening track from \"Bunk\", released under CC BY-SA 3.0.",
    artist: "Jahzzar",
    album: "Bunk",
    trackNumber: 1,
    codec: "MP3",
    bitrate: "200 kbps",
    streamUrl: "https://archive.org/download/Jahzzar-Bunk/Jahzzar%20-%20Bunk%20-%2001%20Intruder.mp3",
    ambientColor: "#9c7a4a",
  },
  {
    id: "demo-music-4",
    title: "The Dome",
    type: "music",
    thumbnail: "https://upload.wikimedia.org/wikipedia/commons/thumb/7/70/Tos-poster.png/1280px-Tos-poster.png",
    year: 2012,
    duration: 311,
    genre: ["Score", "Electronic"],
    description: "From the original score for \"Tears of Steel\", the Blender Foundation's sci-fi open movie. Released under CC BY-ND 3.0.",
    artist: "Joram Letwory",
    album: "Tears of Steel OST",
    trackNumber: 2,
    codec: "MP3",
    bitrate: "320 kbps",
    streamUrl: "https://archive.org/download/TearsOfSteelOst/02TheDome.mp3",
    ambientColor: "#4a5568",
  },
];
