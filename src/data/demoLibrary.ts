import type { MediaItem } from "../types";

// ─── Guest mode / demo library ─────────────────────────────────────────────
//
// Real, legally-clean, freely-licensed content so a visitor can actually click
// Play and watch something — not just look at a mocked-up grid. Everything
// here is the Blender Foundation's "open movies", released under Creative
// Commons Attribution (CC BY 3.0/4.0): https://www.blender.org/about/projects/
//
//   - Video files are served directly from the Internet Archive
//     (archive.org), which mirrors the Blender Foundation's official
//     releases. Verified reachable, correct video/mp4 content-type, and
//     Accept-Ranges: bytes (so seeking works).
//   - Poster art comes from Wikimedia Commons (upload.wikimedia.org/.../commons/...,
//     NOT the fair-use /wikipedia/en/ namespace), credited to the Blender
//     Foundation and confirmed CC BY 3.0 via the file's own extmetadata.
//
// No TMDB/studio key art, no scraped subtitles, nothing that needs a
// takedown-risk judgment call — safe to show to any visitor, indefinitely.

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
];
