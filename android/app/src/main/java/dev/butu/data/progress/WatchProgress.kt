package dev.butu.data.progress

import androidx.compose.runtime.Immutable
import kotlinx.serialization.Serializable

/** Mirrors the localStorage `butu:progress` shape from src/store/useButuStore.ts. */
@Immutable
@Serializable
data class WatchProgress(
    val timeSeconds: Int,
    val season: Int? = null,
    val episode: Int? = null,
    /** Total runtime, so "finished" items can drop out of Continue Watching. */
    val durationSeconds: Int? = null,
    /** Epoch millis of the last update, for most-recent-first ordering. */
    val updatedAt: Long = 0L,
)
