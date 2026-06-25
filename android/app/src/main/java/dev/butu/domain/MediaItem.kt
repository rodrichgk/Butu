package dev.butu.domain

import androidx.compose.runtime.Immutable

/** Mirrors `MediaType` in src/types/index.ts. */
enum class MediaType { Movie, Music, Tv, Web, Anime, Manga }

enum class MarkerType { Intro, Credits }

enum class TrackType { Audio, Subtitle }

@Immutable
data class MediaTrack(
    val id: String,
    val type: TrackType,
    val label: String,
    val isSelected: Boolean,
    val language: String? = null,
    val isDefault: Boolean = false,
)

@Immutable
data class Marker(
    val type: MarkerType,
    val startMs: Long,
    val endMs: Long,
)

@Immutable
data class Episode(
    val id: String,
    val season: Int,
    val episode: Int,
    val title: String,
    val durationSeconds: Int,
    val description: String? = null,
    val thumbnail: String? = null,
    val streamUrl: String? = null,
    val partKey: String? = null,
    val markers: List<Marker> = emptyList(),
    val tracks: List<MediaTrack> = emptyList(),
    /** Provider URIs like `tmdb://1396`, `tvdb://81189`, `imdb://tt0903747`. */
    val externalIds: List<String> = emptyList(),
)

/**
 * Mirrors `MediaItem` in src/types/index.ts.
 * Marked @Immutable so Compose can skip MediaCard recomposition when the parent
 * passes the same instance — keeps LazyRow at 120Hz.
 */
@Immutable
data class MediaItem(
    val id: String,
    val title: String,
    val type: MediaType,
    val thumbnail: String,
    val backdropUrl: String? = null,
    val year: Int? = null,
    val durationSeconds: Int? = null,
    val genre: List<String> = emptyList(),
    val description: String? = null,
    val rating: Float? = null,
    val resolution: String? = null,
    val codec: String? = null,
    val bitrate: String? = null,
    val artist: String? = null,
    val album: String? = null,
    val trackNumber: Int? = null,
    val season: Int? = null,
    val episode: Int? = null,
    val seriesId: String? = null,
    val streamUrl: String? = null,
    val jellyfinId: String? = null,
    val plexKey: String? = null,
    val plexPartKey: String? = null,
    val ambientColor: String? = null,
    val episodes: List<Episode> = emptyList(),
    val markers: List<Marker> = emptyList(),
    val tracks: List<MediaTrack> = emptyList(),
    /** Provider URIs like `tmdb://1396`, `tvdb://81189`, `imdb://tt0903747`. */
    val externalIds: List<String> = emptyList(),
)
