package dev.butu.data.config

import kotlinx.serialization.Serializable

/** Mirrors `ServerType` in src/types/index.ts. */
enum class ServerType { Jellyfin, Plex }

@Serializable
data class JellyfinConfig(
    val serverUrl: String,
    val userId: String,
    val userName: String,
    val token: String,
)

@Serializable
data class PlexConfig(
    val serverUrl: String,
    val token: String,
    val userName: String? = null,
)
