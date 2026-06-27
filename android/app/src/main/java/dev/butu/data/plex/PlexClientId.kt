package dev.butu.data.plex

import android.content.Context
import java.util.UUID

/**
 * Per-install Plex client identifier. Plex uses X-Plex-Client-Identifier to tell
 * devices apart, so every install must report a UNIQUE, stable value — otherwise
 * two Butu clients on the same account collide (they show as one device, and
 * sessions/now-playing step on each other). Generated once and persisted in
 * SharedPreferences so it survives restarts. Read synchronously so the existing
 * (non-suspend) header builders don't have to change.
 */
object PlexClientId {
    private const val PREFS = "butu_plex"
    private const val KEY = "client_id"

    @Volatile private var cached: String? = null

    /** Loads or creates the id. Call once from Application.onCreate(). */
    fun init(context: Context) {
        if (cached != null) return
        val prefs = context.applicationContext.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        cached = prefs.getString(KEY, null) ?: run {
            val fresh = "butu-android-${UUID.randomUUID()}"
            prefs.edit().putString(KEY, fresh).apply()
            fresh
        }
    }

    /** The stable per-install id (falls back to the legacy constant before init). */
    val value: String
        get() = cached ?: PLEX_CLIENT_ID
}
