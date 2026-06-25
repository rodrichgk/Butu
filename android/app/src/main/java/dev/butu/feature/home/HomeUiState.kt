package dev.butu.feature.home

import androidx.compose.runtime.Immutable
import dev.butu.domain.MediaItem
import dev.butu.navigation.Section

/**
 * Mirrors the derived state from `useFilteredLibrary` in src/App.tsx.
 * @Immutable so HomeScreen recomposes only when bucket references actually change.
 */
@Immutable
data class HomeUiState(
    val activeSection: Section = Section.Home,
    val heroSlides: List<MediaItem> = emptyList(),
    val continueWatching: List<MediaItem> = emptyList(),
    val movies: List<MediaItem> = emptyList(),
    val music: List<MediaItem> = emptyList(),
    val tv: List<MediaItem> = emptyList(),
    val anime: List<MediaItem> = emptyList(),
    val manga: List<MediaItem> = emptyList(),
    val library: List<MediaItem> = emptyList(),
    val serverLabel: String? = null,
    val serverUrl: String? = null,
    val serverUser: String? = null,
    val libraryCount: Int = 0,
    val isLoading: Boolean = false,
    val error: String? = null,
    val preferredAudioLanguage: String? = null,
    val preferredSubtitleLanguage: String? = null,
    val subtitlesEnabled: Boolean = false,
    val airMouseEnabled: Boolean = true,
    val airMouseConnected: Boolean = false,
    val airMouseClientAddress: String? = null,
    val localIpAddress: String? = null,
    val autoSkipIntro: Boolean = false,
    val autoSkipCredits: Boolean = false,
    val autoPlayNext: Boolean = true,
    val showHero: Boolean = true,
    val showContinueWatching: Boolean = true,
    val boostVoices: Boolean = true,
)
