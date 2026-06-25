package dev.butu.feature.detail

import androidx.compose.runtime.Immutable
import dev.butu.data.progress.WatchProgress
import dev.butu.domain.Episode
import dev.butu.domain.MediaItem
import dev.butu.domain.MediaType

@Immutable
data class DetailUiState(
    val item: MediaItem? = null,
    val episodes: List<Episode> = emptyList(),
    val episodesLoading: Boolean = false,
    val activeSeason: Int = 1,
    val watchProgress: WatchProgress? = null,
    val episodeProgress: Map<String, WatchProgress> = emptyMap(),
)

/** Mirrors `isEpisodic` in src/components/ContentDetailPage.tsx. */
val DetailUiState.isEpisodic: Boolean
    get() = (item?.type == MediaType.Tv || item?.type == MediaType.Anime)
        && (episodes.isNotEmpty() || episodesLoading)

val DetailUiState.seasons: List<Int>
    get() = episodes.map { it.season }.distinct().sorted()

fun DetailUiState.episodesForActiveSeason(): List<Episode> =
    episodes.filter { it.season == activeSeason }
