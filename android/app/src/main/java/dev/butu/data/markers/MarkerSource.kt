package dev.butu.data.markers

import dev.butu.domain.Marker

/**
 * Identification payload for a marker lookup. Mirrors the eventual cloud API contract:
 * the server will key entries by (provider, providerId, season, episode) with duration as
 * a sanity check. Sources that don't have these fields available can still fall back to
 * matching by title.
 */
data class MarkerTarget(
    /** Local item id (Plex ratingKey or Jellyfin Id) — used for client-side caching only. */
    val itemId: String,
    /** Free-form title — used for the temporary stub source and as a last-resort match. */
    val title: String,
    /** Plex/Jellyfin GUIDs ("tmdb://1396", "imdb://tt0903747"). Empty when unknown. */
    val externalIds: List<String> = emptyList(),
    /** Null for movies. */
    val season: Int? = null,
    val episode: Int? = null,
    val durationMs: Long,
    val isEpisode: Boolean,
)

/**
 * Pluggable marker provider. Plex returns markers inline (`includeMarkers=1`) — those
 * land in `Episode.markers` / `MediaItem.markers` directly without going through this
 * interface. This abstraction is for *fallback* lookups: cloud db, local companion app,
 * Intro Skipper plugin, etc.
 */
interface MarkerSource {
    suspend fun fetchMarkers(target: MarkerTarget): List<Marker>
}
