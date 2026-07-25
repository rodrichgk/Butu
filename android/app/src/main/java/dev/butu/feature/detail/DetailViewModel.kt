package dev.butu.feature.detail

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.butu.data.media.MediaRepository
import dev.butu.data.progress.WatchProgressStore
import dev.butu.domain.MediaType
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class DetailViewModel @Inject constructor(
    savedStateHandle: SavedStateHandle,
    private val mediaRepository: MediaRepository,
    private val watchProgressStore: WatchProgressStore,
) : ViewModel() {

    private val itemId: String = savedStateHandle["itemId"] ?: error("itemId required")

    private val item = MutableStateFlow(mediaRepository.findItem(itemId))
    private val episodes = MutableStateFlow(item.value?.episodes.orEmpty())
    private val episodesLoading = MutableStateFlow(false)
    private val activeSeason = MutableStateFlow(-1)

    val state: StateFlow<DetailUiState> = combine(
        item,
        episodes,
        episodesLoading,
        activeSeason,
        watchProgressStore.all,
    ) { item, episodes, loading, season, allProgress ->
        val progress = allProgress[itemId]
        val epProgress = episodes.mapNotNull { ep -> allProgress[ep.id]?.let { ep.id to it } }.toMap()
        DetailUiState(
            item = item,
            episodes = episodes,
            episodesLoading = loading,
            activeSeason = season.takeIf { it > 0 }
                ?: progress?.season
                ?: episodes.minOfOrNull { it.season }
                ?: 1,
            watchProgress = progress,
            episodeProgress = epProgress,
        )
    }.stateIn(
        scope = viewModelScope,
        started = SharingStarted.WhileSubscribed(5_000),
        initialValue = DetailUiState(item = item.value),
    )

    init {
        loadEpisodesIfNeeded()
    }

    fun setActiveSeason(season: Int) {
        activeSeason.value = season
    }

    private fun loadEpisodesIfNeeded() {
        val current = item.value ?: return
        if (current.type != MediaType.Tv && current.type != MediaType.Anime) return
        if (current.episodes.isNotEmpty()) {
            episodes.value = current.episodes
            return
        }
        // Used to also require `configStore.currentServerType() == ServerType.Plex`, which
        // silently skipped this for every Jellyfin show — the episode list (and so playback,
        // since there was nothing to tap) stayed empty. mediaRepository.fetchEpisodes already
        // dispatches to the right backend on its own (see PlayerViewModel.loadSeriesEpisodes,
        // which never had this restriction); plexShowKey is simply unused on the Jellyfin path.
        val plexShowKey = current.plexKey
        viewModelScope.launch {
            episodesLoading.value = true
            runCatching { mediaRepository.fetchEpisodes(seriesId = current.id, plexShowKey = plexShowKey) }
                .onSuccess { fetched ->
                    episodes.value = fetched
                    val first = fetched.minOfOrNull { it.season } ?: 1
                    if (activeSeason.value == 1) activeSeason.value = first
                }
                .onFailure { e ->
                    android.util.Log.e("DetailVM", "fetchEpisodes failed for ${current.id}: ${e.message}", e)
                }
            episodesLoading.value = false
        }
    }
}
