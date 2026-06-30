package dev.butu.data.jellyfin

import dev.butu.BuildConfig

private const val DEVICE_ID = "butu-android-tv-v1"
private val CLIENT_INFO =
    "Client=\"Butu\", Device=\"AndroidTV\", DeviceId=\"$DEVICE_ID\", Version=\"${BuildConfig.VERSION_NAME}\""

/** Mirrors `authHeader()` in src/services/jellyfinApi.ts. */
fun jellyfinHeaders(token: String? = null): Map<String, String> {
    val auth = if (token != null) "MediaBrowser $CLIENT_INFO, Token=\"$token\""
               else "MediaBrowser $CLIENT_INFO"
    return mapOf(
        "X-Emby-Authorization" to auth,
        "Content-Type" to "application/json",
    )
}
