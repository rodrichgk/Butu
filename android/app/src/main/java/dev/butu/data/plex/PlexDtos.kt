package dev.butu.data.plex

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Mirrors the JSON shape returned by Plex `/library/...` endpoints. */
@Serializable
data class PlexEnvelope(
    @SerialName("MediaContainer") val mediaContainer: PlexMediaContainer = PlexMediaContainer(),
)

@Serializable
data class PlexMediaContainer(
    @SerialName("Directory") val directory: List<PlexSectionDto> = emptyList(),
    @SerialName("Metadata")  val metadata: List<PlexItemDto> = emptyList(),
)

@Serializable
data class PlexSectionDto(
    val key: String = "",
    val title: String = "",
    val type: String = "",   // "movie" / "show" / "artist" / "photo" / "season"
    val ratingKey: String? = null,
    val index: Int? = null,
)

/** Mirrors `PlexRawItem` in src/services/plexApi.ts. */
@Serializable
data class PlexItemDto(
    val ratingKey: String = "",
    val key: String = "",
    val title: String = "",
    val type: String = "",                   // movie / show / episode / season / track / album / artist
    val thumb: String? = null,
    val art: String? = null,
    val year: Int? = null,
    val duration: Long? = null,              // milliseconds
    val summary: String? = null,
    val rating: Float? = null,
    val audienceRating: Float? = null,
    val parentIndex: Int? = null,            // season number on episode
    val index: Int? = null,                  // episode number
    @SerialName("Genre") val genre: List<PlexGenreDto> = emptyList(),
    @SerialName("Media") val media: List<PlexMediaDto> = emptyList(),
    @SerialName("Marker") val markers: List<PlexMarkerDto> = emptyList(),
    @SerialName("Guid")   val guids: List<PlexGuidDto> = emptyList(),
)

/** External provider links: `imdb://tt...`, `tmdb://...`, `tvdb://...`. */
@Serializable
data class PlexGuidDto(
    val id: String = "",
)

/**
 * Plex's chapter-marker entries. Returned by the show's `/children` and `?includeMarkers=1`
 * endpoints. Type is one of "intro", "credits", "commercial", "advertisement".
 */
@Serializable
data class PlexMarkerDto(
    val type: String = "",
    val startTimeOffset: Long = 0L,
    val endTimeOffset: Long = 0L,
)

@Serializable
data class PlexGenreDto(val tag: String)

@Serializable
data class PlexMediaDto(
    val bitrate: Long? = null,
    val width: Int? = null,
    val height: Int? = null,
    val videoCodec: String? = null,
    val audioCodec: String? = null,
    @SerialName("Part") val part: List<PlexPartDto> = emptyList(),
)

@Serializable
data class PlexPartDto(
    val id: Long? = null,
    val key: String,
    val duration: Long? = null,
    @SerialName("Stream") val streams: List<PlexStreamDto> = emptyList(),
)

@Serializable
data class PlexStreamDto(
    val id: Long,
    val streamType: Int, // 2 = audio, 3 = subtitle
    val selected: Boolean = false,
    val language: String? = null,
    val languageCode: String? = null,
    val displayTitle: String? = null,
)

@Serializable
data class PlexSignInResponse(
    val user: PlexSignInUser,
)

@Serializable
data class PlexSignInUser(
    val authToken: String,
    val username: String,
)

/** Response from `plex.tv/api/v2/pins`. `authToken` is null until the user finishes linking. */
@Serializable
data class PlexPinDto(
    val id: Long,
    val code: String,
    val authToken: String? = null,
    val expiresIn: Long? = null,
    val expiresAt: String? = null,
)

/**
 * A server (owned or shared) from plex.tv `/api/v2/resources`. Each carries
 * multiple connection URIs — local (same LAN), remote (direct/port-forwarded),
 * and relay (proxied through plex.tv, works anywhere). `accessToken` is the
 * per-server token to use for THIS server (required for shared servers).
 * Mirrors `PlexServer` in src/services/plexApi.ts.
 */
@Serializable
data class PlexResourceDto(
    val name: String = "Plex Server",
    val clientIdentifier: String = "",
    val provides: String = "",
    val owned: Boolean = false,
    val accessToken: String? = null,
    val connections: List<PlexConnectionDto> = emptyList(),
)

@Serializable
data class PlexConnectionDto(
    val uri: String = "",
    val address: String = "",
    val port: Int = 0,
    val local: Boolean = false,
    val relay: Boolean = false,
)
