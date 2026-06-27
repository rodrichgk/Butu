package dev.butu.data.plex

import dev.butu.data.config.PlexConfig
import dev.butu.domain.Episode
import dev.butu.domain.MediaItem
import dev.butu.domain.MediaType
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeoutOrNull
import okhttp3.OkHttpClient
import okhttp3.Request
import retrofit2.Retrofit
import javax.inject.Inject
import javax.inject.Singleton
import kotlin.random.Random

@Singleton
class PlexRepository @Inject constructor(
    retrofit: Retrofit,
    private val okHttp: OkHttpClient,
) {

    private val api: PlexApi = retrofit.create(PlexApi::class.java)

    suspend fun fetchSections(cfg: PlexConfig): List<PlexSectionDto> {
        val base = cfg.serverUrl.trimEnd('/')
        return api.getEnvelope(
            url = "$base/library/sections",
            headers = plexHeaders(cfg.token),
        ).mediaContainer.directory
    }

    suspend fun fetchSection(cfg: PlexConfig, sectionKey: String): List<MediaItem> {
        val base = cfg.serverUrl.trimEnd('/')
        // includeMarkers=1 attaches intro/credits markers to each item where Plex has run
        // its detection — used for Skip Intro / Skip Credits in the player.
        // includeGuids=1 attaches the external IDs (tmdb://1399) used for Supabase queries.
        val response = api.getEnvelope(
            url = "$base/library/sections/$sectionKey/all?includeMarkers=1&includeGuids=1",
            headers = plexHeaders(cfg.token),
        )
        return response.mediaContainer.metadata.map { it.toMediaItem(cfg) }
    }

    /**
     * Walks every (movie / show) section and aggregates results.
     * Mirrors the loop in src/App.tsx that calls `fetchPlexSection` per section.
     */
    suspend fun fetchLibrary(cfg: PlexConfig): List<MediaItem> = coroutineScope {
        val sections = fetchSections(cfg).filter { it.type == "movie" || it.type == "show" }
        sections
            .map { async { fetchSection(cfg, it.key) } }
            .flatMap { it.await() }
    }

    suspend fun fetchEpisodes(cfg: PlexConfig, showKey: String): List<Episode> = coroutineScope {
        val base = cfg.serverUrl.trimEnd('/')
        val seasonsUrl = "$base$showKey/children"
        android.util.Log.i("PlexRepo", "fetchEpisodes: GET $seasonsUrl")
        // Plex returns seasons in MediaContainer.Directory; episodes within a season come back in Metadata.
        val container = runCatching {
            api.getEnvelope(
                url = seasonsUrl,
                headers = plexHeaders(cfg.token),
            ).mediaContainer
        }.onFailure { e ->
            android.util.Log.e("PlexRepo", "fetchEpisodes seasons failed: ${e.message}", e)
        }.getOrNull()
        val seasonKeys: List<String> = container?.let {
            // Plex returns seasons in `directory` (or sometimes `metadata`). It may also include a
            // virtual "All Episodes" entry pointing at /allLeaves ??" we must skip that, otherwise
            // every episode gets fetched a second time and the season grid doubles up.
            val fromMeta = it.metadata.map { m -> m.key }
            val fromDir  = it.directory.map { d -> d.key }
            (fromMeta + fromDir)
                .filter { k -> k.isNotBlank() && !k.contains("/allLeaves") }
                .distinct()
        }.orEmpty()
        android.util.Log.i("PlexRepo", "fetchEpisodes: got ${seasonKeys.size} season keys")

        seasonKeys
            .map { seasonKey ->
                async {
                    val sep = if (seasonKey.contains('?')) '&' else '?'
                    val epUrl = "$base$seasonKey${sep}includeMarkers=1&includeGuids=1"
                    android.util.Log.i("PlexRepo", "fetchEpisodes: GET $epUrl")
                    runCatching {
                        api.getEnvelope(
                            url = epUrl,
                            headers = plexHeaders(cfg.token),
                        ).mediaContainer.metadata
                    }.onFailure { e ->
                        android.util.Log.e("PlexRepo", "fetchEpisodes season $seasonKey failed: ${e.message}", e)
                    }.getOrElse { emptyList() }
                }
            }
            .flatMap { it.await() }
            .also { android.util.Log.i("PlexRepo", "fetchEpisodes: total ${it.size} episodes") }
            .map { it.toEpisode(cfg) }
    }

    suspend fun fetchItemMetadata(cfg: PlexConfig, ratingKey: String): PlexItemDto? {
        val base = cfg.serverUrl.trimEnd('/')
        val url = "$base/library/metadata/$ratingKey?includeMarkers=1&includeGuids=1"
        return runCatching {
            api.getEnvelope(
                url = url,
                headers = plexHeaders(cfg.token),
            ).mediaContainer.metadata.firstOrNull()
        }.getOrNull()
    }

    suspend fun signIn(username: String, password: String): String {
        val response = api.signIn(
            url = "https://plex.tv/users/sign_in.json",
            headers = plexSignInHeaders(username, password),
            body = PlexSignInBody(login = username, password = password),
        )
        return response.user.authToken
    }

    /**
     * Creates a fresh plex.tv linking PIN. Caller polls `pollPin` until `authToken` appears.
     * Must NOT use `strong=true`: that returns a 25-character code, but the plex.tv/link page
     * (where the QR/phone sends the user) only accepts the default 4-character code. With a
     * strong code there's no way to finish linking, so the app hangs on the QR screen forever.
     */
    suspend fun createPin(): PlexPinDto = api.createPin(
        url = "https://plex.tv/api/v2/pins",
        headers = plexHeaders(),
    )

    /** One-shot poll. Returns the same PIN with `authToken` populated once the user has linked. */
    suspend fun pollPin(id: Long): PlexPinDto = api.getPin(
        url = "https://plex.tv/api/v2/pins/$id",
        headers = plexHeaders(),
    )

    /** URL the QR code should encode — opening this on a phone auto-fills the code on plex.tv/link. */
    fun pinAuthUrl(code: String): String = "https://plex.tv/link?code=$code"

    // ── Server discovery (plex.tv resources) ──────────────────────────────────
    // One call after sign-in returns every server the account can reach — owned
    // AND shared — each with local / remote / relay connection URIs. This makes
    // setup IP-less, remote access work off-network, and shared libraries appear.
    // Mirrors fetchPlexResources/pickPlexConnection in src/services/plexApi.ts.

    /** Lists Plex servers the account can reach — owned first, then shared. */
    suspend fun fetchResources(token: String): List<PlexResourceDto> =
        api.getResources(
            url = "https://plex.tv/api/v2/resources?includeHttps=1&includeRelay=1",
            headers = plexHeaders(token),
        )
            .filter { it.provides.split(",").contains("server") }
            .sortedByDescending { it.owned }

    /**
     * Picks the first reachable connection for a server: local (fast LAN) →
     * remote (direct/port-forwarded) → relay (plex.tv-proxied). Returns the
     * working URI, or null if none answer. Uses the server's own accessToken.
     */
    suspend fun pickConnection(server: PlexResourceDto): String? {
        val token = server.accessToken ?: return null
        val local  = server.connections.filter { it.local && !it.relay }
        val remote = server.connections.filter { !it.local && !it.relay }
        val relay  = server.connections.filter { it.relay }
        return firstReachable(local, token)
            ?: firstReachable(remote, token)
            ?: firstReachable(relay, token)
    }

    private suspend fun firstReachable(conns: List<PlexConnectionDto>, token: String): String? {
        for (c in conns) {
            if (c.uri.isBlank()) continue
            val ok = withTimeoutOrNull(4_000) {
                runCatching { verifyServer(c.uri, token) }.isSuccess
            } ?: false
            if (ok) return c.uri.trimEnd('/')
        }
        return null
    }

    /**
     * Fetches the HLS manifest URL once to prime the Plex transcode session before
     * ExoPlayer begins loading. Mirrors the ContentDetailPage.tsx mount-time fetch
     * of item.streamUrl ("pre-warm"). Without this, many PMS versions respond to
     * ExoPlayer's first request with an error because no session exists yet.
     */
    suspend fun prewarmStream(streamUrl: String) {
        withContext(Dispatchers.IO) {
            runCatching {
                val request = Request.Builder().url(streamUrl).get().build()
                okHttp.newCall(request).execute().close()
            }.onFailure { e ->
                android.util.Log.w("PlexRepo", "prewarmStream failed (non-fatal): ${e.message}")
            }
        }
    }

    /**
     * Prepares a universal-transcode session and returns its HLS `start.m3u8` URL.
     *
     * Calls `/video/:/transcode/universal/decision` first — this is REQUIRED for PMS to honour
     * `audioStreamID`/`subtitleStreamID` on `start.m3u8`; without the decision call, start.m3u8
     * with those params returns HTTP 400 (the bug behind audio switching not working). The
     * decision call also primes the session, so a separate prewarm isn't needed.
     *
     * Concurrent same-item sessions are allowed, so callers start a fresh [session] for each
     * switch (no need to stop the old one first — that triggers a transcoder cooldown) and reap
     * the previous session(s) shortly after via [stopOurTranscodeSessions].
     */
    suspend fun startTranscodeSessionUrl(
        cfg: PlexConfig,
        ratingKey: String,
        session: String,
        audioStreamId: String?,
        subtitleStreamId: String?,
        boostVoices: Boolean = true,
    ): String {
        val base = cfg.serverUrl.trimEnd('/')
        val params = plexUniversalParams(cfg, ratingKey, session, audioStreamId, subtitleStreamId, boostVoices)
        withContext(Dispatchers.IO) {
            runCatching {
                okHttp.newCall(
                    Request.Builder().url("$base/video/:/transcode/universal/decision?$params").get().build(),
                ).execute().close()
            }.onFailure { e ->
                android.util.Log.w("PlexRepo", "transcode decision failed (non-fatal): ${e.message}")
            }
        }
        return "$base/video/:/transcode/universal/start.m3u8?$params"
    }

    /**
     * Pings the server `/identity` endpoint with no token to confirm reachability.
     * Mirrors `verifyPlexServer()` in src/services/plexApi.ts.
     */
    suspend fun verifyServer(serverUrl: String, token: String? = null) {
        val base = serverUrl.trimEnd('/')
        val request = Request.Builder()
            .url("$base/identity")
            .apply {
                plexHeaders(token).forEach { (name, value) -> header(name, value) }
            }
            .get()
            .build()

        withContext(Dispatchers.IO) {
            okHttp.newCall(request).execute().use { response ->
                if (!response.isSuccessful) {
                    error("Plex identity failed with HTTP ${response.code}")
                }
            }
        }
    }
    /**
     * Tells PMS to tear down a universal-transcode session by its session id. Only works when
     * the session was started with a `session=` query param matching [session] (otherwise PMS
     * keyed it by an internal UUID and returns 404). Best-effort — failures are non-fatal.
     */
    suspend fun stopTranscodeSession(cfg: PlexConfig, session: String) {
        val base = cfg.serverUrl.trimEnd('/')
        val url = "$base/video/:/transcode/universal/stop?session=$session&X-Plex-Token=${cfg.token}"
        withContext(Dispatchers.IO) {
            runCatching {
                okHttp.newCall(Request.Builder().url(url).get().build()).execute().close()
            }.onFailure { e ->
                android.util.Log.w("PlexRepo", "stopTranscodeSession failed (non-fatal): ${e.message}")
            }
        }
    }

    /**
     * Stops every transcode session this app started (our session ids are prefixed `butu-`),
     * leaving other Plex clients' sessions untouched. Called before starting a new transcode so
     * orphaned sessions — from a previous switch, a crash, or a killed process — don't pile up
     * and trip the server's concurrent-transcode limit (which manifests as HTTP 400 / endless
     * buffering). Best-effort and non-fatal.
     */
    suspend fun stopOurTranscodeSessions(cfg: PlexConfig, except: String? = null) {
        val base = cfg.serverUrl.trimEnd('/')
        withContext(Dispatchers.IO) {
            val keys = runCatching {
                val req = Request.Builder()
                    .url("$base/transcode/sessions?X-Plex-Token=${cfg.token}")
                    .header("Accept", "application/json")
                    .get().build()
                val body = okHttp.newCall(req).execute().use { it.body?.string() }.orEmpty()
                Regex("\"key\"\\s*:\\s*\"(butu-[^\"]+)\"").findAll(body).map { it.groupValues[1] }.toList()
            }.getOrElse { emptyList() }
            keys.filter { it != except }.forEach { key ->
                android.util.Log.i("PlexRepo", "stopOurTranscodeSessions: stopping $key")
                runCatching {
                    okHttp.newCall(
                        Request.Builder()
                            .url("$base/video/:/transcode/universal/stop?session=$key&X-Plex-Token=${cfg.token}")
                            .get().build(),
                    ).execute().close()
                }
            }
        }
    }

    suspend fun selectTrack(cfg: PlexConfig, partId: String, trackId: String, type: dev.butu.domain.TrackType) {
        val base = cfg.serverUrl.trimEnd('/')
        val params = mutableListOf("X-Plex-Token" to cfg.token, "allParts" to "1")
        if (type == dev.butu.domain.TrackType.Audio) {
            params.add("audioStreamID" to trackId)
        } else {
            params.add("subtitleStreamID" to trackId)
        }
        val query = params.joinToString("&") { "${it.first}=${it.second}" }
        val url = "$base/library/parts/$partId?$query"
        withContext(Dispatchers.IO) {
            runCatching {
                val request = Request.Builder().url(url).put(okhttp3.internal.EMPTY_REQUEST).build()
                okHttp.newCall(request).execute().close()
            }.onFailure { e ->
                android.util.Log.e("PlexRepo", "selectTrack failed: ${e.message}")
            }
        }
    }
}

internal fun PlexItemDto.toMediaItem(cfg: PlexConfig): MediaItem {
    val mediaType = when (type) {
        "movie"  -> MediaType.Movie
        "show"   -> MediaType.Tv
        "artist" -> MediaType.Music
        else     -> MediaType.Movie
    }
    val firstMedia = media.firstOrNull()
    val firstPart  = firstMedia?.part?.firstOrNull()

    return MediaItem(
        id = ratingKey,
        plexKey = "/library/metadata/$ratingKey",
        plexPartKey = firstPart?.id?.toString(),
        title = title,
        type = mediaType,
        thumbnail   = thumb?.let { plexImageUrl(cfg, it) }.orEmpty(),
        backdropUrl = art?.let { plexImageUrl(cfg, it) },
        year = year,
        rating = audienceRating ?: rating,
        durationSeconds = duration?.let { (it / 1000).toInt() },
        genre = genre.map { it.tag },
        description = summary,
        resolution = resolutionLabel(firstMedia?.height),
        codec = firstMedia?.videoCodec?.uppercase(),
        bitrate = firstMedia?.bitrate?.let { "${(it / 1000.0).toInt()} Mbps" },
        streamUrl = plexTranscodeUrl(cfg, ratingKey),
        markers = markers.mapNotNull { it.toDomain() },
        tracks = firstMedia?.part?.firstOrNull()?.streams?.mapNotNull { it.toDomain() }.orEmpty(),
        externalIds = guids.mapNotNull { it.id.takeIf { s -> s.isNotBlank() } },
    )
}

internal fun PlexItemDto.toEpisode(cfg: PlexConfig): Episode {
    val firstPart = media.firstOrNull()?.part?.firstOrNull()
    return Episode(
        id = ratingKey,
        partKey = firstPart?.id?.toString(),
        season = parentIndex ?: 1,
        episode = index ?: 1,
        title = title,
        durationSeconds = duration?.let { (it / 1000).toInt() } ?: (45 * 60),
        description = summary,
        thumbnail = thumb?.let { plexImageUrl(cfg, it) },
        streamUrl = plexTranscodeUrl(cfg, ratingKey),
        markers = markers.mapNotNull { it.toDomain() },
        tracks = firstPart?.streams?.mapNotNull { it.toDomain() }.orEmpty(),
        externalIds = guids.mapNotNull { it.id.takeIf { s -> s.isNotBlank() } },
    )
}

internal fun PlexStreamDto.toDomain(): dev.butu.domain.MediaTrack? {
    val type = when (streamType) {
        2 -> dev.butu.domain.TrackType.Audio
        3 -> dev.butu.domain.TrackType.Subtitle
        else -> return null
    }
    return dev.butu.domain.MediaTrack(
        id = id.toString(),
        type = type,
        label = displayTitle ?: language ?: "Unknown",
        isSelected = selected,
        language = languageCode ?: language,
        isDefault = false,
    )
}

internal fun PlexMarkerDto.toDomain(): dev.butu.domain.Marker? {
    val mt = when (type.lowercase()) {
        "intro"   -> dev.butu.domain.MarkerType.Intro
        "credits" -> dev.butu.domain.MarkerType.Credits
        else      -> return null
    }
    return dev.butu.domain.Marker(type = mt, startMs = startTimeOffset, endMs = endTimeOffset)
}

private fun resolutionLabel(height: Int?): String? = when {
    height == null  -> null
    height >= 2160  -> "4K HDR"
    height >= 1080  -> "1080p"
    height >= 720   -> "720p"
    else            -> "${height}p"
}

internal fun plexImageUrl(cfg: PlexConfig, path: String): String {
    if (path.isBlank()) return ""
    val base = cfg.serverUrl.trimEnd('/')
    return "$base$path?X-Plex-Token=${cfg.token}"
}

internal fun plexDirectStreamUrl(cfg: PlexConfig, partKey: String): String {
    val base = cfg.serverUrl.trimEnd('/')
    return "$base$partKey?X-Plex-Token=${cfg.token}&download=0"
}

/**
 * Query string shared by the universal transcoder's `decision` and `start.m3u8` endpoints.
 *
 * - `session` is what PMS keys the transcode by; without it PMS assigns its own UUID and
 *   `stop?session=<our id>` 404s, orphaning the transcode.
 * - `audioStreamID` / `subtitleStreamID` select the tracks (subtitleStreamID=0 = off). These
 *   are only honoured on `start.m3u8` if `decision` was called first with the same params —
 *   see [PlexRepository.startTranscodeSessionUrl].
 */
internal fun plexUniversalParams(
    cfg: PlexConfig,
    ratingKey: String,
    session: String,
    audioStreamId: String? = null,
    subtitleStreamId: String? = null,
    boostVoices: Boolean = true,
): String = buildList {
    add("X-Plex-Token" to cfg.token)
    add("X-Plex-Client-Identifier" to PlexClientId.value)
    // Match React: report as Chrome so Plex returns the remux HLS profile.
    // PMS rejects (HTTP 400) directStream=1 for "Android TV" platform.
    add("X-Plex-Platform" to "Chrome")
    add("X-Plex-Product" to PLEX_PRODUCT)
    add("X-Plex-Version" to PLEX_VERSION)
    add("path" to "/library/metadata/$ratingKey")
    add("protocol" to "hls")
    add("mediaIndex" to "0")
    add("partIndex" to "0")
    add("fastSeek" to "1")
    add("directPlay" to "0")
    add("directStream" to "1")
    add("copyts" to "1")
    add("audioCodec" to "aac")
    // "Boost voices": downmix surround to stereo on the server instead of letting the device do
    // it. A 5.1/7.1 source folded down by the TV buries the centre channel (dialogue) under the
    // much louder front/surround/LFE channels (effects, cars, fights) — so speech is inaudible
    // while action is deafening. PMS's downmix mixes the centre into L/R properly, and audioBoost
    // lifts the dialogue further (100 = neutral, 200 ≈ +6dB). Off → leave channels untouched.
    if (boostVoices) {
        add("audioChannels" to "2")
        add("audioBoost" to "200")
    } else {
        add("audioBoost" to "100")
    }
    if (audioStreamId != null) add("audioStreamID" to audioStreamId)
    if (subtitleStreamId != null) add("subtitleStreamID" to subtitleStreamId)
    // Burn the chosen subtitle into the video. Without this PMS only offers it as a
    // separate text rendition — which image-based subs (PGS/VOBSUB) can't be, so they
    // simply never appear. subtitleStreamID=0 means "off", so only burn for a real track.
    if (subtitleStreamId != null && subtitleStreamId != "0") {
        add("subtitles" to "burn")
        add("subtitleSize" to "100")
    }
    add("session" to session)
    add("X-Plex-Session-Identifier" to session)
    // Let PMS serve HLS segments while they're still transcoding instead of withholding the
    // playlist until a buffer is built. Without it, a fresh transcode (which "Boost voices"
    // forces by downmixing audio) can leave the player buffering for a long time on the first
    // play. Real Plex clients send this.
    add("X-Plex-Incomplete-Segments" to "1")
}.joinToString("&") { (k, v) ->
    "${java.net.URLEncoder.encode(k, "UTF-8")}=${java.net.URLEncoder.encode(v, "UTF-8")}"
}

/**
 * Mirrors `plexTranscodeUrl()` (the universal HLS URL) in src/services/plexApi.ts. Used as a
 * fallback URL with default streams; the live player path goes through
 * [PlexRepository.startTranscodeSessionUrl] which also selects tracks and primes via `decision`.
 */
internal fun plexTranscodeUrl(
    cfg: PlexConfig,
    ratingKey: String,
    session: String = "butu-$ratingKey",
): String {
    val base = cfg.serverUrl.trimEnd('/')
    return "$base/video/:/transcode/universal/start.m3u8?${plexUniversalParams(cfg, ratingKey, session)}"
}

/**
 * Mirrors `plexTranscodeUrlTV()` — Android TV transcode profile that forces
 * 720p re-encode at 3 Mbps. Use this when the device decoder can't keep up
 * with high-bitrate direct stream.
 */
internal fun plexTranscodeUrlTV(cfg: PlexConfig, ratingKey: String, session: String? = null): String {
    val base = cfg.serverUrl.trimEnd('/')
    val sid = session ?: makePlexSession(ratingKey)
    return "$base/video/:/transcode/universal/start.m3u8?${plexTvTranscodeParams(cfg, ratingKey, sid)}"
}

private fun plexTvTranscodeParams(cfg: PlexConfig, ratingKey: String, session: String): String =
    listOf(
        "path" to "/library/metadata/$ratingKey",
        "protocol" to "hls",
        "offset" to "0",
        "session" to session,
        "mediaIndex" to "0",
        "partIndex" to "0",
        "directPlay" to "0",
        "directStream" to "0",
        "videoResolution" to "1280x720",
        "fastSeek" to "1",
        "copyts" to "1",
        "hasMDE" to "1",
        "location" to "lan",
        "subtitleSize" to "100",
        "audioBoost" to "100",
        "directStreamAudio" to "1",
        "mediaBufferSize" to "102400",
        "subtitles" to "burn",
        "X-Plex-Session-Identifier" to session,
        "X-Plex-Incomplete-Segments" to "1",
        "X-Plex-Product" to PLEX_PRODUCT,
        "X-Plex-Version" to PLEX_VERSION,
        "X-Plex-Client-Identifier" to PlexClientId.value,
        "X-Plex-Platform" to PLEX_PLATFORM,
        "X-Plex-Platform-Version" to "12.0",
        "X-Plex-Features" to "external-media,indirect-media",
        "X-Plex-Model" to "hosted",
        "X-Plex-Device" to "Android",
        "X-Plex-Device-Name" to "Butu TV",
        "X-Plex-Device-Screen-Resolution" to "1920x1080",
        "X-Plex-Token" to cfg.token,
        "X-Plex-Language" to "en",
        "maxVideoBitrate" to "3000",
    ).joinToString("&") { (k, v) ->
        "${java.net.URLEncoder.encode(k, "UTF-8")}=${java.net.URLEncoder.encode(v, "UTF-8")}"
    }

internal fun makePlexSession(ratingKey: String): String {
    val rand = Random.nextLong().toString(36).take(8)
    return "butu-$ratingKey-$rand"
}
