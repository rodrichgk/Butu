package dev.butu.feature.player

import android.content.Context
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.C
import androidx.media3.common.MediaItem as Media3Item
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.common.TrackSelectionOverride
import androidx.media3.common.Tracks
import androidx.media3.exoplayer.ExoPlayer
import java.util.Locale
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import dev.butu.data.config.ConfigStore
import dev.butu.data.config.ServerType
import dev.butu.data.coroutines.AppCoroutineScope
import dev.butu.data.jellyfin.JellyfinRepository
import dev.butu.data.markers.CloudMarkerSource
import dev.butu.data.markers.MarkerSource
import dev.butu.data.markers.MarkerTarget
import dev.butu.data.media.MediaRepository
import dev.butu.data.plex.PlexRepository
import dev.butu.data.plex.makePlexSession
import dev.butu.data.plex.plexTranscodeUrl
import kotlinx.coroutines.CoroutineScope
import dev.butu.data.progress.WatchProgress
import dev.butu.data.progress.WatchProgressStore
import dev.butu.domain.Episode
import dev.butu.domain.Marker
import dev.butu.domain.MarkerType
import dev.butu.domain.MediaItem
import dev.butu.domain.MediaType
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class PlayerViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    savedStateHandle: SavedStateHandle,
    private val mediaRepository: MediaRepository,
    private val configStore: ConfigStore,
    private val plexRepository: PlexRepository,
    private val jellyfinRepository: JellyfinRepository,
    private val watchProgressStore: WatchProgressStore,
    private val cloudMarkerSource: CloudMarkerSource,
    @AppCoroutineScope private val appScope: CoroutineScope,
) : ViewModel() {

    /** All marker fallback sources, ordered. Server-side markers (Plex) still take priority. */
    private val markerSources: List<MarkerSource> = listOf(cloudMarkerSource)

    private val itemId: String = savedStateHandle["itemId"] ?: error("itemId required")
    private val episodeId: String? = savedStateHandle.get<String>("episodeId")?.takeIf { it.isNotEmpty() }
    private val initialStartMs: Long = savedStateHandle["startMs"] ?: 0L

    private val _state = MutableStateFlow(PlayerUiState())
    val state: StateFlow<PlayerUiState> = _state.asStateFlow()

    /** Exposed so the view can attach it to a SurfaceView. */
    val player: ExoPlayer = ExoPlayer.Builder(context).build()

    private var pollJob: Job? = null
    private var reportJob: Job? = null
    private var scrubJob: Job? = null
    private var resolvedItem: MediaItem? = null
    /** The episode currently playing, or null for a movie session. Held so track switching
     *  doesn't depend on the background-loaded [seriesEpisodes] list having arrived yet. */
    private var resolvedEpisode: Episode? = null
    /** The current Plex transcode session id. New playback starts a fresh session alongside
     *  the old one (concurrent same-item transcodes are allowed); the previous session(s) are
     *  reaped a moment later via [cleanupOldPlexSessions], EXCEPT this one. */
    private var currentPlexSession: String? = null
    private var playingItemId: String = itemId   // server-side reporting id (episode > show)
    private var wasPlayingBeforePause: Boolean = false
    private var retryCount: Int = 0
    private var isClosed: Boolean = false
    /** Recovers a transcode that starts buffering but never produces segments (no error fires,
     *  so the onPlayerError retry can't help). Mirrors the user closing + reopening the player. */
    private var bufferWatchdogJob: Job? = null
    private var stallRecoveries: Int = 0

    // ─── Up-Next / autoplay state ──────────────────────────────────────────
    /** Show's full episode list, sorted (season, episode). Empty for movie sessions. */
    private var seriesEpisodes: List<Episode> = emptyList()
    /** Index into [seriesEpisodes] for the current playback. -1 when not loaded yet. */
    private var currentEpisodeIndex: Int = -1
    /** Set when the user dismisses the up-next card so we don't keep popping it back. */
    private var upNextDismissed: Boolean = false
    /** Intro/credits markers for the currently playing item. */
    private var currentMarkers: List<Marker> = emptyList()
    // Playback preferences, snapshotted per item from ConfigStore.
    private var autoSkipIntro: Boolean = false
    private var autoSkipCredits: Boolean = false
    private var autoPlayNext: Boolean = true

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _state.update { it.copy(isPlaying = isPlaying) }
        }

        override fun onPlaybackStateChanged(state: Int) {
            if (state == Player.STATE_READY) {
                retryCount = 0
                stallRecoveries = 0
            }
            if (state == Player.STATE_BUFFERING) armBufferWatchdog() else bufferWatchdogJob?.cancel()
            _state.update {
                it.copy(
                    isBuffering = state == Player.STATE_BUFFERING,
                    durationMs = if (player.duration == C.TIME_UNSET) 0L else player.duration,
                )
            }
            if (state == Player.STATE_ENDED && !upNextDismissed) {
                val next = seriesEpisodes.getOrNull(currentEpisodeIndex + 1)
                if (next != null && autoPlayNext) playNext()
            }
        }

        override fun onPlayerError(error: PlaybackException) {
            val isNetworkError = error.errorCode == PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS ||
                                 error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED ||
                                 error.errorCode == PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT

            if (isNetworkError && retryCount < 10) {
                retryCount++
                android.util.Log.w("PlayerVM", "Network error ${error.errorCode}, retrying ($retryCount/10)...")
                _state.update { it.copy(isBuffering = true) }
                viewModelScope.launch {
                    delay(3000)
                    player.prepare()
                }
                return
            }

            val userMsg = getUserFriendlyErrorMessage(error)
            val logMsg = "Playback error ${error.errorCode}: ${error.message}"
            android.util.Log.e("PlayerVM", logMsg, error)
            _state.update { it.copy(error = userMsg, isBuffering = false) }
        }

        override fun onTracksChanged(tracks: Tracks) {
            // We ignore ExoPlayer's tracks since we handle server-side track selection manually
        }
    }

    init {
        player.playWhenReady = true
        player.addListener(playerListener)

        viewModelScope.launch {
            val resolved = resolvePlayback() ?: run {
                _state.update { it.copy(error = "Could not resolve stream") }
                return@launch
            }
            resolvedItem = resolved.item
            resolvedEpisode = resolved.episode
            playingItemId = resolved.reportingId
            val primaryMarkers = resolved.markers.filter { it.endMs > it.startMs }
            val needsFallback = !primaryMarkers.any { it.type == MarkerType.Intro } ||
                                !primaryMarkers.any { it.type == MarkerType.Credits }

            val fallbacks = if (needsFallback) {
                fetchFallbackMarkers(
                    item = resolved.item,
                    episode = resolved.episode,
                )
            } else emptyList()

            currentMarkers = primaryMarkers + fallbacks.filter { fb -> 
                primaryMarkers.none { it.type == fb.type }
            }
            autoSkipIntro = configStore.currentAutoSkipIntro()
            autoSkipCredits = configStore.currentAutoSkipCredits()
            autoPlayNext = configStore.currentAutoPlayNext()

            _state.update {
                it.copy(
                    item = resolved.item,
                    title = resolved.title,
                    artist = resolved.item.artist,
                    resolution = resolved.item.resolution,
                    codec = resolved.item.codec,
                    bitrate = resolved.item.bitrate,
                    ambientColor = resolved.item.ambientColor,
                )
            }
            
            initTrackOptions(resolved.item, resolved.episode)
            // Apply the saved preferred language to THIS item before building the URL, so the
            // preference carries across every episode/movie — not just where it was set.
            applyPreferredTrackSelection()

            val streamUrl = buildCurrentStreamUrl() ?: run {
                _state.update { it.copy(error = "Could not resolve stream") }
                return@launch
            }
            android.util.Log.i("PlayerVM", "Starting playback: ${redactToken(streamUrl)}")
            applyStickyLanguagePreferences()
            player.setMediaItem(Media3Item.fromUri(streamUrl))
            player.prepare()
            if (initialStartMs > 0) player.seekTo(initialStartMs)
            player.play()
            cleanupOldPlexSessions()

            startPolling()
            startProgressReporting(resolved.reportingId)
            // Background-load the episode list so the up-next overlay can fire near the end.
            launch { loadSeriesEpisodes(resolved.item) }
        }
    }

    /**
     * Queries the chain of fallback marker sources (cloud db today, companion app later)
     * for the playback target. Returns the first source's results, or empty if none knew.
     * Plex's `?includeMarkers=1` data still wins — this is only used when that came back
     * empty (free Plex, Jellyfin without IntroSkipper, etc.).
     */
    private suspend fun fetchFallbackMarkers(item: MediaItem, episode: Episode?): List<Marker> {
        val durationMs = when {
            episode != null -> episode.durationSeconds * 1_000L
            item.durationSeconds != null -> item.durationSeconds * 1_000L
            else -> 0L
        }
        if (durationMs <= 0L) return emptyList()
        // Prefer the episode's own provider IDs when present (some servers attach Tvdb at the
        // episode level); otherwise fall back to the parent show's IDs.
        val ids = (episode?.externalIds.orEmpty() + item.externalIds).distinct()
        val target = MarkerTarget(
            itemId = episode?.id ?: item.id,
            title = item.title,
            externalIds = ids,
            season = episode?.season,
            episode = episode?.episode,
            durationMs = durationMs,
            isEpisode = episode != null,
        )
        android.util.Log.i("PlayerVM", "fetchFallbackMarkers: querying sources for target=$target")
        for (source in markerSources) {
            val result = runCatching { source.fetchMarkers(target) }.getOrNull().orEmpty()
            android.util.Log.i("PlayerVM", "fetchFallbackMarkers: source=$source returned ${result.size} markers")
            if (result.isNotEmpty()) return result
        }
        android.util.Log.i("PlayerVM", "fetchFallbackMarkers: no markers found")
        return emptyList()
    }

    /** Pull the show's full ordered episode list and remember our position in it. */
    private suspend fun loadSeriesEpisodes(item: MediaItem) {
        if (episodeId == null) return  // movie session — no autoplay
        val raw = item.episodes.ifEmpty {
            runCatching { mediaRepository.fetchEpisodes(seriesId = item.id, plexShowKey = item.plexKey) }
                .getOrElse { emptyList() }
        }
        val ordered = raw.sortedWith(compareBy({ it.season }, { it.episode }))
        seriesEpisodes = ordered
        currentEpisodeIndex = ordered.indexOfFirst { it.id == episodeId }
    }

    fun togglePlayPause() {
        if (player.isPlaying) player.pause() else player.play()
    }

    fun seekBy(deltaMs: Long) {
        val duration = if (player.duration == C.TIME_UNSET) 0L else player.duration
        val baseMs = _state.value.scrubbingTargetMs ?: player.currentPosition.coerceAtLeast(0L)
        val target = (baseMs + deltaMs).coerceIn(0L, if (duration == 0L) Long.MAX_VALUE else duration)
        
        _state.update { it.copy(scrubbingTargetMs = target) }
        
        scrubJob?.cancel()
        scrubJob = viewModelScope.launch {
            delay(500)
            player.seekTo(target)
            _state.update { it.copy(currentTimeMs = target, scrubbingTargetMs = null) }
        }
    }

    fun seekTo(positionMs: Long) {
        val duration = if (player.duration == C.TIME_UNSET) 0L else player.duration
        val target = positionMs.coerceIn(0L, if (duration == 0L) Long.MAX_VALUE else duration)
        
        _state.update { it.copy(scrubbingTargetMs = target) }
        
        scrubJob?.cancel()
        scrubJob = viewModelScope.launch {
            delay(500)
            player.seekTo(target)
            _state.update { it.copy(currentTimeMs = target, scrubbingTargetMs = null) }
        }
    }

    fun setMuted(muted: Boolean) {
        player.volume = if (muted) 0f else 1f
        _state.update { it.copy(isMuted = muted) }
    }

    /** Caller should invoke this from the screen's `BackHandler` and on close. */
    fun onClosing() {
        if (isClosed) return
        isClosed = true
        val item = resolvedItem ?: return
        val timeMs = _state.value.scrubbingTargetMs ?: player.currentPosition
        val timeSeconds = (timeMs / 1000L).toInt()
        val durationSec = (player.duration / 1000L).toInt()
        // App-scope, not viewModelScope: navigation away cancels viewModelScope mid-write,
        // which was occasionally dropping the final progress save.
        android.util.Log.d("PlayerVM", "onClosing: timeSeconds=$timeSeconds, durationSec=$durationSec, item=${item.id}, epId=$playingItemId")
        appScope.launch {
            runCatching {
                persistWatchProgress(item, timeSeconds, durationSec)
                reportStoppedRemote(timeSeconds)
            }.onFailure { e ->
                android.util.Log.e("PlayerVM", "Error in persistWatchProgress", e)
            }
        }
    }

    /**
     * Hook the screen lifecycle to pause when the display goes off and resume when it
     * comes back. Without this ExoPlayer keeps decoding to a destroyed surface and the
     * Plex transcode session times out — producing the "Source error" on wake.
     */
    fun onAppPaused() {
        wasPlayingBeforePause = player.isPlaying
        if (player.isPlaying) player.pause()
        if (isClosed) return
        val item = resolvedItem ?: return
        val timeMs = _state.value.scrubbingTargetMs ?: player.currentPosition
        val timeSeconds = (timeMs / 1000L).toInt()
        val durationSec = (player.duration / 1000L).toInt()
        appScope.launch {
            runCatching {
                persistWatchProgress(item, timeSeconds, durationSec)
            }.onFailure { e ->
                android.util.Log.e("PlayerVM", "Error in persistWatchProgress (paused)", e)
            }
        }
    }

    fun onAppResumed() {
        val resume = wasPlayingBeforePause
        wasPlayingBeforePause = false
        // If the Plex transcode session expired during sleep, the player is in an error/idle
        // state — reload the same stream and seek to where we left off.
        if (player.playerError != null || player.playbackState == Player.STATE_IDLE) {
            val resolved = resolvedItem ?: return
            val resumePos = player.currentPosition.coerceAtLeast(0L)
            viewModelScope.launch {
                // For episode sessions we MUST resolve the episode's URL — using the show's
                // URL gets a 400 from Plex (shows aren't transcodable directly).
                val episode = resolvedEpisode
                val url = if (episode != null) {
                    resolveEpisodeStreamUrl(episode) ?: episode.streamUrl
                } else {
                    resolveStreamUrl(resolved)
                } ?: return@launch
                
                android.util.Log.i("PlayerVM", "Resuming after app background: ${redactToken(url)}")
                _state.update { it.copy(error = null) }
                applyStickyLanguagePreferences()
                player.setMediaItem(Media3Item.fromUri(url))
                player.prepare()
                if (resumePos > 0) player.seekTo(resumePos)
                if (resume) player.play()
                cleanupOldPlexSessions()
            }
            return
        }
        if (resume) player.play()
    }

    override fun onCleared() {
        if (!isClosed) {
            onClosing()
        }
        pollJob?.cancel()
        reportJob?.cancel()
        bufferWatchdogJob?.cancel()
        player.removeListener(playerListener)
        player.release()
        super.onCleared()
    }

    // ─── Stream resolution ──────────────────────────────────────────────────

    private data class ResolvedPlayback(
        val item: MediaItem,
        val episode: Episode?,
        val title: String,
        val reportingId: String,
        val markers: List<Marker>,
    )

    private suspend fun resolvePlayback(): ResolvedPlayback? {
        val baseItem = mediaRepository.findItem(itemId) ?: return null
        if (episodeId == null) {
            val itemWithTracks = mediaRepository.fetchItemMetadata(baseItem, null)
            return ResolvedPlayback(
                item = itemWithTracks,
                episode = null,
                title = itemWithTracks.title,
                reportingId = itemWithTracks.id,
                markers = itemWithTracks.markers,
            )
        }
        val episode = resolveEpisode(baseItem) ?: return null
        val itemWithTracks = mediaRepository.fetchItemMetadata(baseItem, episode)
        // fetchItemMetadata refreshes the *show* item's tracks from the episode; carry those
        // back onto the episode too so track ids match what we play.
        val episodeWithTracks = episode.copy(
            tracks = itemWithTracks.tracks.ifEmpty { episode.tracks },
        )
        return ResolvedPlayback(
            item = itemWithTracks.copy(season = episode.season, episode = episode.episode),
            episode = episodeWithTracks,
            title = "${itemWithTracks.title} · S${episode.season} E${episode.episode} · ${episode.title}",
            reportingId = episode.id,
            markers = episode.markers,
        )
    }

    /** Builds the stream URL for the current item/episode using the active track selection. */
    private suspend fun buildCurrentStreamUrl(): String? {
        val item = resolvedItem ?: return null
        val episode = resolvedEpisode
        return if (episode != null) resolveEpisodeStreamUrl(episode) ?: episode.streamUrl
               else resolveStreamUrl(item)
    }

    private suspend fun resolveEpisode(item: MediaItem): Episode? {
        item.episodes.firstOrNull { it.id == episodeId }?.let { return it }
        if (item.type != MediaType.Tv && item.type != MediaType.Anime) return null
        val plexShowKey = item.plexKey
        val fetched = runCatching {
            mediaRepository.fetchEpisodes(seriesId = item.id, plexShowKey = plexShowKey)
        }.getOrElse { emptyList() }
        return fetched.firstOrNull { it.id == episodeId }
    }

    private suspend fun resolveStreamUrl(item: MediaItem): String? =
        resolvePlexOrServerStreamUrl(ratingKey = item.id) {
            mediaRepository.getStreamUrl(item, it.audioTrackId, it.subtitleTrackId)
        }

    private suspend fun resolveEpisodeStreamUrl(episode: Episode): String? =
        resolvePlexOrServerStreamUrl(ratingKey = episode.id) {
            mediaRepository.getEpisodeStreamUrl(episode, it.audioTrackId, it.subtitleTrackId)
        }

    /** The currently-selected track ids, in the form each backend expects. */
    private data class SelectedTracks(val audioTrackId: String?, val subtitleTrackId: String?)

    private fun selectedTracks(): SelectedTracks {
        val audio = _state.value.audioTracks.find { it.isSelected }?.id
        val subtitle = _state.value.subtitleTracks.find { it.isSelected }?.id
            ?.takeIf { !_state.value.subtitlesDisabled }
        return SelectedTracks(audio, subtitle)
    }

    /**
     * Builds the stream URL for the active backend. For Plex we (re)build the universal
     * transcode URL ourselves so the selected audio/subtitle stream is baked into the
     * request, with a fresh session id so PMS starts a new transcode rather than resuming
     * the previous one. Other backends defer to [block] (the repository URL builder).
     */
    private suspend fun resolvePlexOrServerStreamUrl(
        ratingKey: String,
        block: suspend (SelectedTracks) -> String?,
    ): String? {
        val selected = selectedTracks()
        if (configStore.currentServerType() == ServerType.Plex) {
            val cfg = configStore.currentPlex() ?: return null
            // Select tracks via audioStreamID/subtitleStreamID on the transcode URL, primed by a
            // /decision call (see PlexRepository.startTranscodeSessionUrl) — that's the flow real
            // Plex clients use. subtitleStreamID=0 turns subtitles off.
            //
            // We do NOT stop the previous session first: stopping a transcode then immediately
            // starting another for the SAME item makes PMS reject the new one for a few seconds
            // (a cooldown → endless 400/spin). Concurrent same-item transcodes are allowed, so we
            // start the new one and reap the old session(s) shortly after (see cleanupOldPlexSessions).
            val session = makePlexSession(ratingKey)
            currentPlexSession = session
            val subtitleStreamId = if (_state.value.subtitlesDisabled) "0" else selected.subtitleTrackId
            val url = plexRepository.startTranscodeSessionUrl(
                cfg = cfg,
                ratingKey = ratingKey,
                session = session,
                audioStreamId = selected.audioTrackId,
                subtitleStreamId = subtitleStreamId,
                boostVoices = configStore.currentBoostVoices(),
            )
            android.util.Log.i("PlayerVM", "Plex stream URL: ${redactToken(url)}")
            return url
        }
        return block(selected)
    }

    /**
     * Reaps our previous Plex transcode session(s) a few seconds after new playback starts —
     * keeping only [currentPlexSession]. Run after play() (not before building the URL) so we
     * never stop-then-immediately-start the same item, which trips the transcoder cooldown.
     */
    private fun cleanupOldPlexSessions() {
        val keep = currentPlexSession ?: return
        viewModelScope.launch {
            if (configStore.currentServerType() != ServerType.Plex) return@launch
            val cfg = configStore.currentPlex() ?: return@launch
            delay(4000)
            runCatching { plexRepository.stopOurTranscodeSessions(cfg, except = keep) }
        }
    }

    /**
     * Armed whenever playback enters STATE_BUFFERING. If we're still buffering with no forward
     * progress after [STALL_TIMEOUT_MS], the transcode session never started serving (a silent
     * stall — no error is raised, so onPlayerError can't recover it). Rebuild the stream on a
     * fresh session, which is exactly what closing and reopening the player did by hand.
     */
    private fun armBufferWatchdog() {
        bufferWatchdogJob?.cancel()
        val startPos = player.currentPosition
        bufferWatchdogJob = viewModelScope.launch {
            delay(STALL_TIMEOUT_MS)
            val stuck = player.playbackState == Player.STATE_BUFFERING &&
                player.currentPosition <= startPos + 250
            if (stuck && stallRecoveries < MAX_STALL_RECOVERIES) {
                stallRecoveries++
                android.util.Log.w("PlayerVM", "Buffering stalled — rebuilding stream ($stallRecoveries/$MAX_STALL_RECOVERIES)")
                runCatching { rebuildAndRestart(startPos) }
            }
        }
    }

    /** Stops the current stream and starts a fresh one (new Plex session) at [resumeMs]. */
    private suspend fun rebuildAndRestart(resumeMs: Long) {
        val wasPlaying = player.playWhenReady
        _state.update { it.copy(error = null, isBuffering = true) }
        player.stop()
        player.clearMediaItems()
        val url = buildCurrentStreamUrl() ?: return
        android.util.Log.i("PlayerVM", "Stall recovery, new stream: ${redactToken(url)}")
        applyStickyLanguagePreferences()
        player.setMediaItem(Media3Item.fromUri(url))
        player.prepare()
        if (resumeMs > 0) player.seekTo(resumeMs)
        if (wasPlaying) player.play()
        cleanupOldPlexSessions()
    }

    // ─── Polling + reporting ────────────────────────────────────────────────

    /** ExoPlayer doesn't push a tick on every frame — poll position at 4Hz. */
    private fun startPolling() {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            while (true) {
                val durationMs = if (player.duration == C.TIME_UNSET) 0L else player.duration
                val currentMs = player.currentPosition.coerceAtLeast(0L)
                val nextEp = if (currentEpisodeIndex >= 0)
                    seriesEpisodes.getOrNull(currentEpisodeIndex + 1) else null

                // Which marker is the playhead inside? Plex sometimes ships zero-length or
                // overlapping markers — pick whichever encloses currentMs.
                var activeMarker = currentMarkers.firstOrNull { m ->
                    m.endMs > m.startMs && currentMs in m.startMs..m.endMs
                }

                // Auto-skip if the user enabled it for this marker type — seek past it
                // and hide the manual Skip pill (otherwise it flashes for a frame).
                activeMarker?.let { m ->
                    val auto = if (m.type == MarkerType.Intro) autoSkipIntro else autoSkipCredits
                    if (auto && player.isPlaying) {
                        player.seekTo(m.endMs + 100)
                        activeMarker = null
                    }
                }

                // Up Next is now anchored to the credits marker rather than a time-left
                // heuristic. Falls back to "last 30s" only when no credits marker exists,
                // since some media won't have one.
                val timeLeftMs = (durationMs - currentMs).coerceAtLeast(0L)
                val hasCreditsMarker = currentMarkers.any { it.type == MarkerType.Credits }
                val showUpNext = nextEp != null
                    && !upNextDismissed
                    && durationMs > 0
                    && player.isPlaying
                    && (
                        activeMarker?.type == MarkerType.Credits ||
                        (!hasCreditsMarker && timeLeftMs in 1L..30_000L)
                    )

                _state.update {
                    it.copy(
                        currentTimeMs = currentMs,
                        durationMs = durationMs,
                        bufferedMs = player.bufferedPosition.coerceAtLeast(0L),
                        nextEpisode = nextEp,
                        showUpNext = showUpNext,
                        activeMarker = activeMarker,
                    )
                }
                delay(250)
            }
        }
    }

    /** Seeks past the active intro/credits marker. */
    fun skipMarker() {
        val marker = currentMarkers.firstOrNull { m ->
            m.endMs > m.startMs && player.currentPosition in m.startMs..m.endMs
        } ?: return
        // Leave a tiny pad so we land just after the marker — avoids snapping back.
        player.seekTo(marker.endMs + 100)
    }

    /** Switches the player to the next episode without leaving the player surface. */
    fun playNext() {
        val next = seriesEpisodes.getOrNull(currentEpisodeIndex + 1) ?: return
        switchToEpisode(next)
    }

    /** Hide the up-next card for the rest of this episode. */
    fun dismissUpNext() {
        upNextDismissed = true
        _state.update { it.copy(showUpNext = false) }
    }

    // ─── Audio + subtitle track selection ───────────────────────────────────

    private fun initTrackOptions(item: MediaItem, episode: Episode?) {
        val tracks = episode?.tracks?.takeIf { it.isNotEmpty() } ?: item.tracks
        
        val audioTracks = tracks.filter { it.type == dev.butu.domain.TrackType.Audio }.map { track ->
            TrackOption(
                id = track.id,
                label = track.label,
                language = track.language,
                isSelected = track.isSelected,
                groupIndex = 0,
                trackIndex = 0,
            )
        }
        
        val subtitleTracks = tracks.filter { it.type == dev.butu.domain.TrackType.Subtitle }.map { track ->
            TrackOption(
                id = track.id,
                label = track.label,
                language = track.language,
                isSelected = track.isSelected,
                groupIndex = 0,
                trackIndex = 0,
            )
        }
        
        val subtitlesDisabled = subtitleTracks.none { it.isSelected }

        _state.update {
            it.copy(
                audioTracks = audioTracks,
                subtitleTracks = subtitleTracks,
                subtitlesDisabled = subtitlesDisabled,
            )
        }
    }

    /**
     * Auto-applies the user's saved preferred audio (and subtitle) language to the current
     * item, so the choice carries across every episode/movie instead of only the one where it
     * was picked. Updates the in-memory selection AND pushes it to the server (Plex part PUT)
     * so the transcode actually uses it. No-op when there's no saved preference / no match.
     * Call after [initTrackOptions] and before building the stream URL.
     */
    private suspend fun applyPreferredTrackSelection() {
        val prefAudio = configStore.currentPreferredAudioLanguage()
        val prefSub = configStore.currentPreferredSubtitleLanguage()
        val subsOn = configStore.currentSubtitlesEnabled()
        val item = resolvedItem ?: return
        val episode = resolvedEpisode

        if (!prefAudio.isNullOrBlank()) {
            _state.value.audioTracks.firstOrNull { langMatches(it.language, prefAudio) }?.let { match ->
                _state.update { s ->
                    s.copy(audioTracks = s.audioTracks.map { it.copy(isSelected = it.id == match.id) })
                }
                runCatching { mediaRepository.selectTrack(item, episode, match.id, dev.butu.domain.TrackType.Audio) }
            }
        }

        // Only touch subtitles when the user actually expressed a subtitle preference, so we
        // don't override a file's default/forced subs for users who never set one.
        if (!prefSub.isNullOrBlank()) {
            if (subsOn) {
                _state.value.subtitleTracks.firstOrNull { langMatches(it.language, prefSub) }?.let { match ->
                    _state.update { s ->
                        s.copy(
                            subtitlesDisabled = false,
                            subtitleTracks = s.subtitleTracks.map { it.copy(isSelected = it.id == match.id) },
                        )
                    }
                    runCatching { mediaRepository.selectTrack(item, episode, match.id, dev.butu.domain.TrackType.Subtitle) }
                }
            } else {
                _state.update { s ->
                    s.copy(
                        subtitlesDisabled = true,
                        subtitleTracks = s.subtitleTracks.map { it.copy(isSelected = false) },
                    )
                }
                runCatching { mediaRepository.selectTrack(item, episode, "0", dev.butu.domain.TrackType.Subtitle) }
            }
        }
    }

    /** Strips the Plex token from a URL before logging it. */
    private fun redactToken(url: String): String =
        url.replace(Regex("X-Plex-Token=[^&]*"), "X-Plex-Token=***")

    /** Loose ISO-language compare. Same Plex server reports consistent codes, so an
     *  exact (case-insensitive) match is enough; falls back to the 2-letter prefix. */
    private fun langMatches(a: String?, b: String?): Boolean {
        if (a.isNullOrBlank() || b.isNullOrBlank()) return false
        if (a.equals(b, ignoreCase = true)) return true
        return a.length >= 2 && b.length >= 2 && a.take(2).equals(b.take(2), ignoreCase = true)
    }

    fun selectAudioTrack(option: TrackOption) {
        _state.update { state ->
            state.copy(
                audioTracks = state.audioTracks.map { it.copy(isSelected = it.id == option.id) }
            )
        }
        viewModelScope.launch { 
            configStore.setPreferredAudioLanguage(option.language)
            val currentMs = player.currentPosition
            changeTracksAndRestart(currentMs)
        }
    }

    fun selectSubtitleTrack(option: TrackOption) {
        _state.update { state ->
            state.copy(
                subtitlesDisabled = false,
                subtitleTracks = state.subtitleTracks.map { it.copy(isSelected = it.id == option.id) }
            )
        }
        viewModelScope.launch {
            configStore.setPreferredSubtitleLanguage(option.language)
            configStore.setSubtitlesEnabled(true)
            val currentMs = player.currentPosition
            changeTracksAndRestart(currentMs)
        }
    }

    fun disableSubtitles() {
        _state.update { state ->
            state.copy(
                subtitlesDisabled = true,
                subtitleTracks = state.subtitleTracks.map { it.copy(isSelected = false) }
            )
        }
        viewModelScope.launch { 
            configStore.setSubtitlesEnabled(false)
            val currentMs = player.currentPosition
            changeTracksAndRestart(currentMs)
        }
    }

    private suspend fun changeTracksAndRestart(resumeMs: Long) {
        val item = resolvedItem ?: return
        // Use the episode resolved at playback start, not seriesEpisodes[currentEpisodeIndex]
        // — that list loads in the background and may not be ready yet, which previously made
        // an episode switch fall back to the (unplayable) show id.
        val episode = resolvedEpisode

        // 1. Tell the server to select tracks (Plex persists this on the part).
        val audioOpt = _state.value.audioTracks.find { it.isSelected }
        val subOpt = _state.value.subtitleTracks.find { it.isSelected }

        if (audioOpt != null) {
            runCatching { mediaRepository.selectTrack(item, episode, audioOpt.id, dev.butu.domain.TrackType.Audio) }
        }
        if (subOpt != null && !_state.value.subtitlesDisabled) {
            runCatching { mediaRepository.selectTrack(item, episode, subOpt.id, dev.butu.domain.TrackType.Subtitle) }
        } else {
            // Unset subtitles
            runCatching { mediaRepository.selectTrack(item, episode, "0", dev.butu.domain.TrackType.Subtitle) }
        }

        val wasPlaying = player.isPlaying
        _state.update { it.copy(error = null, isBuffering = true) }

        // 2. Release the current stream BEFORE building the next one. While ExoPlayer is still
        //    pulling the old transcode's segments, PMS keeps that session alive and rejects the
        //    new session with HTTP 400 — which surfaced as an endless spinner that only cleared
        //    after leaving the player long enough for the old session to time out.
        player.stop()
        player.clearMediaItems()

        // 3. Build the rebuilt URL (stops the old Plex session + starts a fresh one that honours
        //    the server-side track selection set above).
        val url = buildCurrentStreamUrl() ?: return

        android.util.Log.i("PlayerVM", "Restarting after track change: ${redactToken(url)}")

        // Also nudge ExoPlayer's own selector, for the case where the stream direct-plays
        // (container carries every track) instead of transcoding to a single one.
        applyStickyLanguagePreferences()

        player.setMediaItem(Media3Item.fromUri(url))
        player.prepare()
        if (resumeMs > 0) player.seekTo(resumeMs)
        if (wasPlaying) player.play()
        cleanupOldPlexSessions()
    }

    /**
     * Pushes the user's saved audio/subtitle language into [Player.trackSelectionParameters]
     * before media is prepared, so each new stream auto-selects the matching track when one
     * is advertised.
     */
    private suspend fun applyStickyLanguagePreferences() {
        // Sticky language is applied by Plex/Jellyfin account settings usually.
        // We still apply it to ExoPlayer just in case the container has multiple tracks (Direct Play).
        val audioLang = configStore.currentPreferredAudioLanguage()
        val subLang   = configStore.currentPreferredSubtitleLanguage()
        val subsOn    = configStore.currentSubtitlesEnabled()
        player.trackSelectionParameters = player.trackSelectionParameters.buildUpon()
            .apply {
                if (!audioLang.isNullOrBlank()) setPreferredAudioLanguage(audioLang)
                if (!subLang.isNullOrBlank())   setPreferredTextLanguage(subLang)
                setTrackTypeDisabled(C.TRACK_TYPE_TEXT, !subsOn)
            }
            .build()
    }

    private fun formatLabel(label: String?, language: String?, channels: Int?): String {
        val name = when {
            !label.isNullOrBlank() -> label
            !language.isNullOrBlank() -> Locale.forLanguageTag(language).displayLanguage
                .replaceFirstChar { c -> c.titlecase(Locale.getDefault()) }
                .ifBlank { language.uppercase() }
            else -> "Unknown"
        }
        return if (channels != null && channels > 2) "$name · $channels.0" else name
    }

    private fun switchToEpisode(episode: Episode) {
        val current = resolvedItem ?: return
        
        // Prevent double-clicks and hide the UI immediately before network suspension
        upNextDismissed = true
        _state.update { it.copy(showUpNext = false) }

        viewModelScope.launch {
            // Mark the outgoing episode as stopped on the server.
            val outgoingSeconds = (player.currentPosition / 1000L).toInt()
            reportStoppedRemote(outgoingSeconds)

            currentEpisodeIndex = seriesEpisodes.indexOfFirst { it.id == episode.id }
            playingItemId = episode.id
            val primaryMarkers = episode.markers.filter { it.endMs > it.startMs }
            val needsFallback = !primaryMarkers.any { it.type == MarkerType.Intro } || 
                                !primaryMarkers.any { it.type == MarkerType.Credits }
            
            val fallbacks = if (needsFallback) {
                fetchFallbackMarkers(item = current, episode = episode)
            } else emptyList()
            
            currentMarkers = primaryMarkers + fallbacks.filter { fb -> 
                primaryMarkers.none { it.type == fb.type }
            }
            autoSkipIntro = configStore.currentAutoSkipIntro()
            autoSkipCredits = configStore.currentAutoSkipCredits()
            autoPlayNext = configStore.currentAutoPlayNext()

            val updated = current.copy(season = episode.season, episode = episode.episode)
            resolvedItem = updated

            // Refresh the audio/subtitle list for the new file — track ids and the set of
            // languages differ per episode, so the menu (and any later switch) must rebind.
            val episodeWithTracks = runCatching {
                val refreshed = mediaRepository.fetchItemMetadata(current, episode)
                episode.copy(tracks = refreshed.tracks.ifEmpty { episode.tracks })
            }.getOrDefault(episode)
            resolvedEpisode = episodeWithTracks
            initTrackOptions(updated, episodeWithTracks)
            // Carry the preferred language into the next episode too.
            applyPreferredTrackSelection()

            val newTitle = "${current.title} · S${episode.season} E${episode.episode} · ${episode.title}"
            _state.update {
                it.copy(
                    item = updated,
                    title = newTitle,
                    showUpNext = false,
                    nextEpisode = null,
                    currentTimeMs = 0L,
                    bufferedMs = 0L,
                    durationMs = 0L,
                    error = null,
                    activeMarker = null,
                )
            }

            // Release the outgoing episode's stream before starting the next (see
            // changeTracksAndRestart) so the new Plex transcode session isn't rejected.
            player.stop()
            player.clearMediaItems()

            val url = buildCurrentStreamUrl() ?: run {
                _state.update { it.copy(error = "Could not resolve next episode stream") }
                return@launch
            }
            android.util.Log.i("PlayerVM", "Auto-advance to S${episode.season}E${episode.episode}: ${redactToken(url)}")
            applyStickyLanguagePreferences()
            player.setMediaItem(Media3Item.fromUri(url))
            player.prepare()
            player.play()
            cleanupOldPlexSessions()

            startProgressReporting(episode.id)
            
            // Allow the new episode to show the card at its end
            upNextDismissed = false
        }
    }

    private fun startProgressReporting(reportingId: String) {
        reportJob?.cancel()
        reportJob = viewModelScope.launch {
            reportStartRemote(reportingId)
            while (true) {
                delay(10_000)
                reportProgressRemote(reportingId)
            }
        }
    }

    private suspend fun reportStartRemote(id: String) {
        val seconds = (initialStartMs / 1000L).toInt()
        if (configStore.currentServerType() == ServerType.Jellyfin) {
            configStore.currentJellyfin()?.let { jellyfinRepository.reportStart(it, id, seconds) }
        }
    }

    private suspend fun reportProgressRemote(id: String) {
        if (configStore.currentServerType() != ServerType.Jellyfin) return
        val cfg = configStore.currentJellyfin() ?: return
        val seconds = (player.currentPosition / 1000L).toInt()
        jellyfinRepository.reportProgress(cfg, id, seconds, isPaused = !player.isPlaying)
    }

    private suspend fun reportStoppedRemote(seconds: Int) {
        if (configStore.currentServerType() != ServerType.Jellyfin) return
        val cfg = configStore.currentJellyfin() ?: return
        jellyfinRepository.reportStopped(cfg, playingItemId, seconds)
    }

    private suspend fun persistWatchProgress(item: MediaItem, seconds: Int, durationSec: Int) {
        if (seconds <= 5) return
        
        val isFinished = durationSec > 0 && seconds > durationSec * 0.95f
        
        if (isFinished) {
            // Find the next episode to advance the show's progress
            val currentIdx = seriesEpisodes.indexOfFirst { it.id == playingItemId }
            val nextEp = if (currentIdx in 0 until seriesEpisodes.lastIndex) seriesEpisodes[currentIdx + 1] else null
            
            if (nextEp != null) {
                // Save the show's progress as the start of the NEXT episode
                watchProgressStore.set(item.id, WatchProgress(
                    timeSeconds = 0,
                    season = nextEp.season,
                    episode = nextEp.episode,
                ))
            } else {
                // No next episode, just save the show at the end of the current one
                watchProgressStore.set(item.id, WatchProgress(
                    timeSeconds = durationSec,
                    season = item.season,
                    episode = item.episode,
                    durationSeconds = durationSec,
                    updatedAt = System.currentTimeMillis(),
                ))
            }
            
            // Mark the specific episode as fully watched
            val epId = playingItemId
            if (epId != null && epId != item.id) {
                watchProgressStore.set(epId, WatchProgress(
                    timeSeconds = durationSec,
                    season = item.season,
                    episode = item.episode,
                    durationSeconds = durationSec,
                    updatedAt = System.currentTimeMillis(),
                ))
            }
            return
        }

        val prog = WatchProgress(
            timeSeconds = seconds,
            season = item.season,
            episode = item.episode,
            durationSeconds = durationSec,
            updatedAt = System.currentTimeMillis(),
        )
        
        // Save against the show (so "Continue Watching" row works)
        watchProgressStore.set(item.id, prog)
        
        // Save against the specific episode (so EpisodeGrid shows per-episode progress)
        val epId = playingItemId
        if (epId != null && epId != item.id) {
            watchProgressStore.set(epId, prog)
        }
    }

    private fun getUserFriendlyErrorMessage(error: PlaybackException): String {
        return when (error.errorCode) {
            PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS -> 
                "The media server returned an error. The server might be waking up a sleeping drive or starting the transcoder. Please wait a moment and try again."
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
            PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT ->
                "Network connection failed. Please check your internet connection and ensure the media server is online."
            PlaybackException.ERROR_CODE_DECODER_INIT_FAILED ->
                "The video format is not supported by your device's hardware decoder."
            PlaybackException.ERROR_CODE_BEHIND_LIVE_WINDOW ->
                "The live stream fell behind. Please restart playback."
            else ->
                "An unexpected playback error occurred (Code: ${error.errorCode}). Please try again."
        }
    }

    private companion object {
        /** How long a silent buffer can persist before we assume the transcode stalled. */
        const val STALL_TIMEOUT_MS = 18_000L
        /** Cap auto-rebuilds so a genuinely unplayable item can't loop forever. */
        const val MAX_STALL_RECOVERIES = 3
    }
}
