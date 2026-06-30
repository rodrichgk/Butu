package dev.butu.data.plex

import android.util.Base64
import dev.butu.BuildConfig

// Legacy fallback only — the live value comes from PlexClientId.value (per-install).
internal const val PLEX_CLIENT_ID = "butu-android-tv-v1"
internal const val PLEX_PRODUCT   = "Butu"
internal val PLEX_VERSION   = BuildConfig.VERSION_NAME
internal const val PLEX_PLATFORM  = "Android TV"

/** Mirrors `plexHeaders()` in src/services/plexApi.ts. */
fun plexHeaders(token: String? = null): Map<String, String> = buildMap {
    put("X-Plex-Client-Identifier", PlexClientId.value)
    put("X-Plex-Product", PLEX_PRODUCT)
    put("X-Plex-Version", PLEX_VERSION)
    put("X-Plex-Platform", PLEX_PLATFORM)
    put("Accept", "application/json")
    if (token != null) put("X-Plex-Token", token)
}

/** Sign-in to plex.tv requires Basic auth on top of the standard headers. */
internal fun plexSignInHeaders(username: String, password: String): Map<String, String> =
    plexHeaders().toMutableMap().apply {
        put("Content-Type", "application/json")
        val raw = "$username:$password".toByteArray(Charsets.UTF_8)
        put("Authorization", "Basic " + Base64.encodeToString(raw, Base64.NO_WRAP))
    }
