package dev.butu.data.jellyfin

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** Mirrors `JellyfinRawItem` in src/services/jellyfinApi.ts. */
@Serializable
data class JellyfinItemsResponse(
    @SerialName("Items") val items: List<JellyfinItemDto> = emptyList(),
)

@Serializable
data class JellyfinItemDto(
    @SerialName("Id") val id: String,
    @SerialName("Name") val name: String,
    @SerialName("Type") val type: String,
    @SerialName("ProductionYear") val productionYear: Int? = null,
    @SerialName("Overview") val overview: String? = null,
    @SerialName("CommunityRating") val communityRating: Float? = null,
    @SerialName("RunTimeTicks") val runTimeTicks: Long? = null,
    @SerialName("IndexNumber") val indexNumber: Int? = null,
    @SerialName("ParentIndexNumber") val parentIndexNumber: Int? = null,
    @SerialName("SeriesId") val seriesId: String? = null,
    @SerialName("SeriesName") val seriesName: String? = null,
    @SerialName("SeasonId") val seasonId: String? = null,
    @SerialName("BackdropImageTags") val backdropImageTags: List<String> = emptyList(),
    @SerialName("ImageTags") val imageTags: JellyfinImageTagsDto? = null,
    @SerialName("GenreItems") val genreItems: List<JellyfinGenreDto> = emptyList(),
    @SerialName("MediaSources") val mediaSources: List<JellyfinMediaSourceDto> = emptyList(),
    @SerialName("UserData") val userData: JellyfinUserDataDto? = null,
    @SerialName("ProviderIds") val providerIds: Map<String, String> = emptyMap(),
)

@Serializable
data class JellyfinImageTagsDto(
    @SerialName("Primary") val primary: String? = null,
    @SerialName("Backdrop") val backdrop: String? = null,
)

@Serializable
data class JellyfinGenreDto(
    @SerialName("Id") val id: String,
    @SerialName("Name") val name: String,
)

@Serializable
data class JellyfinMediaSourceDto(
    @SerialName("Id") val id: String,
    @SerialName("Path") val path: String? = null,
    @SerialName("Container") val container: String? = null,
    @SerialName("Bitrate") val bitrate: Long? = null,
    @SerialName("MediaStreams") val mediaStreams: List<JellyfinMediaStreamDto> = emptyList(),
)

@Serializable
data class JellyfinMediaStreamDto(
    @SerialName("Type") val type: String? = null,        // "Video" / "Audio" / "Subtitle"
    @SerialName("Codec") val codec: String? = null,
    @SerialName("Width") val width: Int? = null,
    @SerialName("Height") val height: Int? = null,
    @SerialName("DisplayTitle") val displayTitle: String? = null,
    @SerialName("Index") val index: Int? = null,
    @SerialName("Language") val language: String? = null,
    @SerialName("IsDefault") val isDefault: Boolean = false,
    @SerialName("IsTextSubtitleStream") val isTextSubtitleStream: Boolean = false,
)

@Serializable
data class JellyfinUserDataDto(
    @SerialName("PlaybackPositionTicks") val playbackPositionTicks: Long = 0,
    @SerialName("Played") val played: Boolean = false,
    @SerialName("PlayCount") val playCount: Int = 0,
    @SerialName("IsFavorite") val isFavorite: Boolean = false,
    @SerialName("LastPlayedDate") val lastPlayedDate: String? = null,
)

@Serializable
data class JellyfinAuthResponse(
    @SerialName("AccessToken") val accessToken: String,
    @SerialName("User") val user: JellyfinAuthUserDto,
)

@Serializable
data class JellyfinAuthUserDto(
    @SerialName("Id") val id: String,
    @SerialName("Name") val name: String,
)

/** Server identity ping ( /System/Info/Public ). Used to verify the URL points at Jellyfin. */
@Serializable
data class JellyfinPublicInfo(
    @SerialName("Id") val id: String? = null,
    @SerialName("ServerName") val serverName: String? = null,
    @SerialName("Version") val version: String? = null,
)

/**
 * Jellyfin Quick Connect — analogous to the Plex PIN flow.
 * Initiate returns `Code` (display to user) + `Secret` (we poll with this). The user
 * approves the code on a device that's already signed into the same Jellyfin server.
 */
@Serializable
data class JellyfinQuickConnectState(
    @SerialName("Authenticated") val authenticated: Boolean = false,
    @SerialName("Code") val code: String,
    @SerialName("Secret") val secret: String,
)
