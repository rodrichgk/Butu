package dev.butu.feature.home

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.butu.data.config.ConfigStore
import dev.butu.data.config.ServerType
import dev.butu.data.media.MediaRepository
import dev.butu.data.progress.WatchProgressStore
import dev.butu.domain.MediaItem
import dev.butu.domain.MediaType
import dev.butu.navigation.Section
import dev.butu.feature.airmouse.AirMouseRepository
import dev.butu.util.NetworkUtil
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val mediaRepository: MediaRepository,
    private val configStore: ConfigStore,
    private val airMouseRepository: AirMouseRepository,
    private val watchProgressStore: WatchProgressStore,
) : ViewModel() {

    private val activeSection = MutableStateFlow(Section.Home)
    private val loading       = MutableStateFlow(false)
    private val error         = MutableStateFlow<String?>(null)

    private data class MediaSnap(
        val section: Section,
        val items: List<MediaItem>,
        val rawCount: Int,
        val isLoading: Boolean,
        val error: String?,
    )

    private data class ServerSnap(
        val label: String?,
        val url: String?,
        val user: String?,
    )

    private val mediaFlow = combine(
        activeSection,
        mediaRepository.library,
        mediaRepository.isConfigured,
        loading,
        error,
    ) { section, library, _, isLoading, errorMsg ->
        // No fake catalog before a server is connected — the home shell shows a
        // real empty/connect state instead (mirrors the TS app's mock removal).
        MediaSnap(section, library, library.size, isLoading, errorMsg)
    }

    private val serverFlow = combine(
        configStore.serverType,
        configStore.jellyfin,
        configStore.plex,
    ) { type, j, p ->
        when (type) {
            ServerType.Jellyfin -> ServerSnap("JELLYFIN SERVER", j?.serverUrl, j?.userName)
            ServerType.Plex     -> ServerSnap("PLEX SERVER",     p?.serverUrl, p?.userName)
            else                -> ServerSnap(null, null, null)
        }
    }

    private data class SettingsSnap(
        val preferredAudioLanguage: String?,
        val preferredSubtitleLanguage: String?,
        val subtitlesEnabled: Boolean,
        val airMouseEnabled: Boolean,
        val airMouseConnected: Boolean,
        val airMouseClientAddress: String?,
    )

    private val settingsFlow = combine(
        configStore.preferredAudioLanguage,
        configStore.preferredSubtitleLanguage,
        configStore.subtitlesEnabled,
        configStore.airMouseEnabled,
        airMouseRepository.state,
    ) { audio, sub, subsEnabled, airMouseEnabled, airMouseState ->
        SettingsSnap(
            preferredAudioLanguage = audio,
            preferredSubtitleLanguage = sub,
            subtitlesEnabled = subsEnabled,
            airMouseEnabled = airMouseEnabled,
            airMouseConnected = airMouseState.connected,
            airMouseClientAddress = airMouseState.clientAddress,
        )
    }

    private data class PlaybackSnap(
        val autoSkipIntro: Boolean,
        val autoSkipCredits: Boolean,
        val autoPlayNext: Boolean,
        val showHero: Boolean,
        val showContinueWatching: Boolean,
        val boostVoices: Boolean,
    )

    // Kept separate from settingsFlow. Six flows exceeds the typed combine overloads,
    // so this uses the vararg form (all Flow<Boolean>).
    private val playbackFlow = combine(
        configStore.autoSkipIntro,
        configStore.autoSkipCredits,
        configStore.autoPlayNext,
        configStore.showHero,
        configStore.showContinueWatching,
        configStore.boostVoices,
    ) { v ->
        PlaybackSnap(v[0], v[1], v[2], v[3], v[4], v[5])
    }

    private val localIpAddress = NetworkUtil.getLocalIpAddress()

    val state: StateFlow<HomeUiState> = combine(
        mediaFlow, serverFlow, settingsFlow, playbackFlow, watchProgressStore.all,
    ) { media, server, settings, playback, progress ->
        // Items started but not finished, most-recent first. The player saves a
        // progress entry against the show/movie id, so this surfaces both.
        val resume = media.items
            .filter { item ->
                val p = progress[item.id] ?: return@filter false
                val notFinished = p.durationSeconds == null ||
                    p.timeSeconds < (p.durationSeconds * 0.95).toInt()
                p.timeSeconds > 5 && notFinished
            }
            .sortedByDescending { progress[it.id]?.updatedAt ?: 0L }
        HomeUiState(
            activeSection    = media.section,
            heroSlides       = media.items.take(3),
            library          = media.items,
            movies           = media.items.byType(MediaType.Movie),
            music            = media.items.byType(MediaType.Music),
            tv               = media.items.byType(MediaType.Tv),
            anime            = media.items.byType(MediaType.Anime),
            manga            = media.items.byType(MediaType.Manga),
            continueWatching = resume,
            serverLabel      = server.label,
            serverUrl        = server.url,
            serverUser       = server.user,
            libraryCount     = media.rawCount,
            isLoading        = media.isLoading,
            error            = media.error,
            preferredAudioLanguage = settings.preferredAudioLanguage,
            preferredSubtitleLanguage = settings.preferredSubtitleLanguage,
            subtitlesEnabled = settings.subtitlesEnabled,
            airMouseEnabled = settings.airMouseEnabled,
            airMouseConnected = settings.airMouseConnected,
            airMouseClientAddress = settings.airMouseClientAddress,
            localIpAddress = localIpAddress,
            autoSkipIntro = playback.autoSkipIntro,
            autoSkipCredits = playback.autoSkipCredits,
            autoPlayNext = playback.autoPlayNext,
            showHero = playback.showHero,
            showContinueWatching = playback.showContinueWatching,
            boostVoices = playback.boostVoices,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = HomeUiState(),
    )

    init {
        // RootViewModel kicks the initial refresh during the splash; skip the second pass
        // when the library is already populated, otherwise the home screen flashes
        // "Loading library…" right after the splash exits.
        if (mediaRepository.library.value.isEmpty()) refresh()
    }

    fun setActiveSection(section: Section) {
        activeSection.value = section
    }

    fun disconnect() {
        viewModelScope.launch { configStore.clearAll() }
    }

    fun setPreferredAudioLanguage(lang: String?) {
        viewModelScope.launch { configStore.setPreferredAudioLanguage(lang) }
    }

    fun setPreferredSubtitleLanguage(lang: String?) {
        viewModelScope.launch { configStore.setPreferredSubtitleLanguage(lang) }
    }

    fun setSubtitlesEnabled(enabled: Boolean) {
        viewModelScope.launch { configStore.setSubtitlesEnabled(enabled) }
    }

    fun setAirMouseEnabled(enabled: Boolean) {
        viewModelScope.launch { configStore.setAirMouseEnabled(enabled) }
    }

    fun setAutoSkipIntro(v: Boolean) { viewModelScope.launch { configStore.setAutoSkipIntro(v) } }
    fun setAutoSkipCredits(v: Boolean) { viewModelScope.launch { configStore.setAutoSkipCredits(v) } }
    fun setAutoPlayNext(v: Boolean) { viewModelScope.launch { configStore.setAutoPlayNext(v) } }
    fun setShowHero(v: Boolean) { viewModelScope.launch { configStore.setShowHero(v) } }
    fun setShowContinueWatching(v: Boolean) { viewModelScope.launch { configStore.setShowContinueWatching(v) } }
    fun setBoostVoices(v: Boolean) { viewModelScope.launch { configStore.setBoostVoices(v) } }

    fun refresh() {
        viewModelScope.launch {
            loading.value = true
            error.value = null
            mediaRepository.refreshLibrary()
                .onFailure { error.value = it.message ?: "Library load failed" }
            loading.value = false
        }
    }

    private fun List<MediaItem>.byType(type: MediaType) = filter { it.type == type }
}
