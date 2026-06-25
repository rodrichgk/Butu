package dev.butu.data.jellyfin

import dev.butu.data.config.JellyfinConfig
import dev.butu.domain.Episode
import dev.butu.domain.MediaItem
import dev.butu.domain.MediaType
import retrofit2.Retrofit
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class JellyfinRepository @Inject constructor(retrofit: Retrofit) {

    private val api: JellyfinApi = retrofit.create(JellyfinApi::class.java)

    suspend fun fetchLibrary(cfg: JellyfinConfig): List<MediaItem> {
        val base = cfg.serverUrl.trimEnd('/')
        val response = api.getItems(
            url = "$base/Users/${cfg.userId}/Items",
            headers = jellyfinHeaders(cfg.token),
        )
        return response.items.map { it.toMediaItem(cfg) }
    }

    suspend fun fetchEpisodes(cfg: JellyfinConfig, seriesId: String): List<Episode> {
        val base = cfg.serverUrl.trimEnd('/')
        val response = api.getEpisodes(
            url = "$base/Shows/$seriesId/Episodes",
            headers = jellyfinHeaders(cfg.token),
            userId = cfg.userId,
        )
        return response.items.map { it.toEpisode(cfg) }
    }

    suspend fun authenticate(serverUrl: String, username: String, password: String): JellyfinConfig {
        val base = serverUrl.trimEnd('/')
        val response = api.authenticate(
            url = "$base/Users/AuthenticateByName",
            headers = jellyfinHeaders(),
            body = AuthenticateBody(username, password),
        )
        return response.toConfig(base)
    }

    /** Pings `/System/Info/Public` to confirm the URL is a Jellyfin server. */
    suspend fun verifyServer(serverUrl: String) {
        val base = serverUrl.trimEnd('/')
        api.systemPublicInfo(
            url = "$base/System/Info/Public",
            headers = jellyfinHeaders(),
        )
    }

    suspend fun quickConnectInitiate(serverUrl: String): JellyfinQuickConnectState {
        val base = serverUrl.trimEnd('/')
        return api.quickConnectInitiate(
            url = "$base/QuickConnect/Initiate",
            headers = jellyfinHeaders(),
        )
    }

    suspend fun quickConnectPoll(serverUrl: String, secret: String): JellyfinQuickConnectState {
        val base = serverUrl.trimEnd('/')
        return api.quickConnectConnect(
            url = "$base/QuickConnect/Connect",
            headers = jellyfinHeaders(),
            secret = secret,
        )
    }

    suspend fun authenticateWithQuickConnect(serverUrl: String, secret: String): JellyfinConfig {
        val base = serverUrl.trimEnd('/')
        val response = api.authenticateWithQuickConnect(
            url = "$base/Users/AuthenticateWithQuickConnect",
            headers = jellyfinHeaders(),
            body = QuickConnectAuthBody(secret),
        )
        return response.toConfig(base)
    }

    suspend fun reportStart(cfg: JellyfinConfig, itemId: String, positionSeconds: Int) {
        val base = cfg.serverUrl.trimEnd('/')
        runCatching {
            api.reportPlayingStart(
                url = "$base/Sessions/Playing",
                headers = jellyfinHeaders(cfg.token),
                body = PlayingStartBody(itemId, secondsToTicks(positionSeconds)),
            )
        }
    }

    suspend fun reportProgress(cfg: JellyfinConfig, itemId: String, positionSeconds: Int, isPaused: Boolean) {
        val base = cfg.serverUrl.trimEnd('/')
        runCatching {
            api.reportPlayingProgress(
                url = "$base/Sessions/Playing/Progress",
                headers = jellyfinHeaders(cfg.token),
                body = PlayingProgressBody(itemId, secondsToTicks(positionSeconds), isPaused),
            )
        }
    }

    suspend fun reportStopped(cfg: JellyfinConfig, itemId: String, positionSeconds: Int) {
        val base = cfg.serverUrl.trimEnd('/')
        runCatching {
            api.reportPlayingStopped(
                url = "$base/Sessions/Playing/Stopped",
                headers = jellyfinHeaders(cfg.token),
                body = PlayingStoppedBody(itemId, secondsToTicks(positionSeconds)),
            )
        }
    }
}

private fun JellyfinAuthResponse.toConfig(base: String) = JellyfinConfig(
    serverUrl = base,
    token = accessToken,
    userId = user.id,
    userName = user.name,
)

internal fun JellyfinItemDto.toMediaItem(cfg: JellyfinConfig): MediaItem {
    val mediaType = when (type) {
        "Movie"  -> MediaType.Movie
        "Series" -> MediaType.Tv
        "Audio"  -> MediaType.Music
        else     -> MediaType.Movie
    }
    val videoStream = mediaSources.firstOrNull()
        ?.mediaStreams?.firstOrNull { it.type == "Video" }
    val mediaSource = mediaSources.firstOrNull()

    return MediaItem(
        id = id,
        jellyfinId = id,
        title = name,
        type = mediaType,
        thumbnail = jellyfinImageUrl(cfg, id, ImageType.Primary, maxWidth = 400),
        backdropUrl = if (backdropImageTags.isNotEmpty())
            jellyfinImageUrl(cfg, id, ImageType.Backdrop, maxWidth = 1920)
        else null,
        year = productionYear,
        rating = communityRating,
        durationSeconds = runTimeTicks?.let { ticksToSeconds(it) },
        genre = genreItems.map { it.name },
        description = overview,
        resolution = resolutionLabel(videoStream?.height),
        codec = videoStream?.codec?.uppercase(),
        bitrate = mediaSource?.bitrate?.let { "${(it / 1_000_000.0).toInt()} Mbps" },
        streamUrl = jellyfinStreamUrl(cfg, id),
        tracks = mediaSource?.mediaStreams?.mapNotNull { it.toDomain() }.orEmpty(),
        externalIds = providerIds.toExternalIds(),
    )
}

/**
 * Normalises Jellyfin's `{Tmdb: "1396", Imdb: "tt0903747", ...}` map into the
 * `tmdb://1396` URI form Plex already uses — single shape for downstream code.
 */
private fun Map<String, String>.toExternalIds(): List<String> = mapNotNull { (rawProvider, rawId) ->
    val provider = rawProvider.trim().lowercase()
    if (provider.isBlank() || rawId.isBlank()) return@mapNotNull null
    "$provider://$rawId"
}

internal fun JellyfinItemDto.toEpisode(cfg: JellyfinConfig): Episode {
    val mediaSource = mediaSources.firstOrNull()
    return Episode(
        id = id,
        season = parentIndexNumber ?: 1,
        episode = indexNumber ?: 1,
        title = name,
        durationSeconds = runTimeTicks?.let { ticksToSeconds(it) } ?: (45 * 60),
        description = overview,
        thumbnail = jellyfinImageUrl(cfg, id, ImageType.Primary, maxWidth = 400),
        streamUrl = jellyfinStreamUrl(cfg, id),
        tracks = mediaSource?.mediaStreams?.mapNotNull { it.toDomain() }.orEmpty(),
        externalIds = providerIds.toExternalIds(),
    )
}

internal fun JellyfinMediaStreamDto.toDomain(): dev.butu.domain.MediaTrack? {
    val trackType = when (type?.lowercase()) {
        "audio" -> dev.butu.domain.TrackType.Audio
        "subtitle" -> dev.butu.domain.TrackType.Subtitle
        else -> return null
    }
    val trackId = index?.toString() ?: return null
    return dev.butu.domain.MediaTrack(
        id = trackId,
        type = trackType,
        label = displayTitle ?: language ?: "Unknown",
        isSelected = isDefault, // We'll just mark the default as selected initially
        language = language,
        isDefault = isDefault,
    )
}

private fun resolutionLabel(height: Int?): String? = when {
    height == null    -> null
    height >= 2160    -> "4K HDR"
    height >= 1080    -> "1080p"
    height >= 720     -> "720p"
    else              -> "${height}p"
}

private const val TICKS_PER_SECOND = 10_000_000L

internal fun ticksToSeconds(ticks: Long): Int = (ticks / TICKS_PER_SECOND).toInt()
internal fun secondsToTicks(seconds: Int): Long = seconds.toLong() * TICKS_PER_SECOND

internal enum class ImageType { Primary, Backdrop }

internal fun jellyfinImageUrl(
    cfg: JellyfinConfig,
    itemId: String,
    type: ImageType,
    maxWidth: Int = 400,
): String {
    val base = cfg.serverUrl.trimEnd('/')
    return "$base/Items/$itemId/Images/${type.name}?maxWidth=$maxWidth&api_key=${cfg.token}"
}

/**
 * Returns the HLS master manifest. Jellyfin will direct-stream when the source codec is
 * compatible and transcode otherwise — equivalent of Plex's `directStream=1` HLS URL.
 *
 * `static=true` direct play (the previous behaviour) only works for h264/aac in mp4/mkv
 * containers; everything else fails on ExoPlayer with a source error.
 */
internal fun jellyfinStreamUrl(
    cfg: JellyfinConfig,
    itemId: String,
    audioTrackId: String? = null,
    subtitleTrackId: String? = null,
    boostVoices: Boolean = true,
): String {
    val base = cfg.serverUrl.trimEnd('/')
    val params = mutableListOf(
        "api_key" to cfg.token,
        "DeviceId" to "butu-android-tv-v1",
        "MediaSourceId" to itemId,
        "PlaySessionId" to "butu-$itemId",
        "VideoCodec" to "h264,hevc",
        "AudioCodec" to "aac,mp3,ac3,eac3",
        "SubtitleMethod" to "Encode",
        "MaxStreamingBitrate" to "20000000",
    )
    // "Boost voices": force a server-side stereo downmix (ffmpeg mixes the centre/dialogue
    // channel into L/R properly) instead of letting the TV fold 5.1 down and bury speech under
    // the effects. Jellyfin has no separate dialogue-gain knob, so the clean downmix is the lever.
    if (boostVoices) params.add("MaxAudioChannels" to "2")
    if (audioTrackId != null) params.add("AudioStreamIndex" to audioTrackId)
    if (subtitleTrackId != null) params.add("SubtitleStreamIndex" to subtitleTrackId)
    
    val query = params.joinToString("&") { (k, v) ->
        "${java.net.URLEncoder.encode(k, "UTF-8")}=${java.net.URLEncoder.encode(v, "UTF-8")}"
    }
    return "$base/Videos/$itemId/main.m3u8?$query"
}
