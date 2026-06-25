package dev.butu.feature.player

import androidx.compose.runtime.Immutable
import dev.butu.domain.Episode
import dev.butu.domain.Marker
import dev.butu.domain.MediaItem

/** A selectable audio or subtitle track exposed to the UI. */
@Immutable
data class TrackOption(
    /** Stable identifier composed of group index + track index. */
    val id: String,
    /** Human-friendly label ("English 5.1", "français"...). */
    val label: String,
    /** ISO language code if reported by the manifest. */
    val language: String?,
    val isSelected: Boolean,
    /** Internal indices used to build the ExoPlayer override. */
    val groupIndex: Int,
    val trackIndex: Int,
)

/** Mirrors `PlayerState` in src/types/index.ts. */
@Immutable
data class PlayerUiState(
    val item: MediaItem? = null,
    val title: String = "",
    val artist: String? = null,
    val resolution: String? = null,
    val codec: String? = null,
    val bitrate: String? = null,
    val ambientColor: String? = null,
    val isPlaying: Boolean = false,
    val isBuffering: Boolean = false,
    val currentTimeMs: Long = 0,
    val scrubbingTargetMs: Long? = null,
    val durationMs: Long = 0,
    val bufferedMs: Long = 0,
    val isMuted: Boolean = false,
    val error: String? = null,
    /** Next episode in the same show, or null when none / not a TV session. */
    val nextEpisode: Episode? = null,
    /** True when we're in the "Up Next" overlay window — driven by the credits marker. */
    val showUpNext: Boolean = false,
    /** The intro/credits marker the playhead is currently inside, if any. */
    val activeMarker: Marker? = null,
    val audioTracks: List<TrackOption> = emptyList(),
    val subtitleTracks: List<TrackOption> = emptyList(),
    /** Subtitles disabled at the player level (no track selected). */
    val subtitlesDisabled: Boolean = true,
)
