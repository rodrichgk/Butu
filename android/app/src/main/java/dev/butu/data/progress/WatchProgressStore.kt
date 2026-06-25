package dev.butu.data.progress

import android.content.Context
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private val Context.progressDataStore by preferencesDataStore(name = "butu_watch_progress")

/**
 * Persists per-item watch progress. Replaces the localStorage `butu:progress`
 * map in src/store/useButuStore.ts.
 */
@Singleton
class WatchProgressStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
) {
    private val key = stringPreferencesKey("progress_map")

    val all: Flow<Map<String, WatchProgress>> = context.progressDataStore.data.map { prefs ->
        val raw = prefs[key] ?: return@map emptyMap()
        runCatching { json.decodeFromString<Map<String, WatchProgress>>(raw) }.getOrElse { emptyMap() }
    }

    fun progress(itemId: String): Flow<WatchProgress?> = all.map { it[itemId] }

    suspend fun set(itemId: String, progress: WatchProgress) {
        context.progressDataStore.edit { prefs ->
            val current = prefs[key]
                ?.let { runCatching { json.decodeFromString<Map<String, WatchProgress>>(it) }.getOrNull() }
                .orEmpty()
            prefs[key] = json.encodeToString(current + (itemId to progress))
        }
    }

    suspend fun current(itemId: String): WatchProgress? = all.first()[itemId]
}
