package dev.butu.data.config

import android.content.Context
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.serialization.SerializationException
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore by preferencesDataStore(name = "butu_config")

/**
 * Replaces the localStorage-backed config in src/store/useButuStore.ts.
 * All three keys (jellyfin / plex / serverType) are persisted via DataStore so
 * they survive process death the same way localStorage survives a tab close.
 */
@Singleton
class ConfigStore @Inject constructor(
    @ApplicationContext private val context: Context,
    private val json: Json,
) {

    val serverType: Flow<ServerType?> = context.dataStore.data.map { prefs ->
        prefs[Keys.ServerType]?.let { runCatching { ServerType.valueOf(it) }.getOrNull() }
    }

    val jellyfin: Flow<JellyfinConfig?> = context.dataStore.data.map { prefs ->
        prefs[Keys.Jellyfin]?.let { decodeOrNull<JellyfinConfig>(it) }
    }

    val plex: Flow<PlexConfig?> = context.dataStore.data.map { prefs ->
        prefs[Keys.Plex]?.let { decodeOrNull<PlexConfig>(it) }
    }

    suspend fun setServerType(type: ServerType?) {
        context.dataStore.edit { prefs ->
            if (type == null) prefs.remove(Keys.ServerType)
            else prefs[Keys.ServerType] = type.name
        }
    }

    suspend fun setJellyfin(cfg: JellyfinConfig?) {
        context.dataStore.edit { prefs ->
            if (cfg == null) prefs.remove(Keys.Jellyfin)
            else prefs[Keys.Jellyfin] = json.encodeToString(cfg)
        }
    }

    suspend fun setPlex(cfg: PlexConfig?) {
        context.dataStore.edit { prefs ->
            if (cfg == null) prefs.remove(Keys.Plex)
            else prefs[Keys.Plex] = json.encodeToString(cfg)
        }
    }

    suspend fun currentJellyfin(): JellyfinConfig? = jellyfin.first()
    suspend fun currentPlex(): PlexConfig? = plex.first()
    suspend fun currentServerType(): ServerType? = serverType.first()

    // ─── Sticky track-language preferences ─────────────────────────────────
    // Applied on every player prepare so the preferred audio/subs auto-select
    // when a stream advertises them. Manual track selection updates these.

    val preferredAudioLanguage: Flow<String?> = context.dataStore.data.map { it[Keys.AudioLang] }
    val preferredSubtitleLanguage: Flow<String?> = context.dataStore.data.map { it[Keys.SubLang] }
    val subtitlesEnabled: Flow<Boolean> = context.dataStore.data.map { it[Keys.SubsEnabled] ?: false }
    val airMouseEnabled: Flow<Boolean> = context.dataStore.data.map { it[Keys.AirMouseEnabled] ?: true }

    suspend fun currentPreferredAudioLanguage(): String? = preferredAudioLanguage.first()
    suspend fun currentPreferredSubtitleLanguage(): String? = preferredSubtitleLanguage.first()
    suspend fun currentSubtitlesEnabled(): Boolean = subtitlesEnabled.first()

    suspend fun setPreferredAudioLanguage(lang: String?) {
        context.dataStore.edit { prefs ->
            if (lang.isNullOrBlank()) prefs.remove(Keys.AudioLang)
            else prefs[Keys.AudioLang] = lang
        }
    }

    suspend fun setPreferredSubtitleLanguage(lang: String?) {
        context.dataStore.edit { prefs ->
            if (lang.isNullOrBlank()) prefs.remove(Keys.SubLang)
            else prefs[Keys.SubLang] = lang
        }
    }

    suspend fun setSubtitlesEnabled(enabled: Boolean) {
        context.dataStore.edit { prefs -> prefs[Keys.SubsEnabled] = enabled }
    }

    suspend fun setAirMouseEnabled(enabled: Boolean) {
        context.dataStore.edit { prefs -> prefs[Keys.AirMouseEnabled] = enabled }
    }

    suspend fun currentAirMouseEnabled(): Boolean = airMouseEnabled.first()

    // Last TV/host address this phone paired with as a remote (see feature/remote).
    val airMouseHost: Flow<String?> = context.dataStore.data.map { it[Keys.AirMouseHost] }
    suspend fun currentAirMouseHost(): String? = airMouseHost.first()
    suspend fun setAirMouseHost(host: String?) {
        context.dataStore.edit { prefs ->
            if (host.isNullOrBlank()) prefs.remove(Keys.AirMouseHost)
            else prefs[Keys.AirMouseHost] = host
        }
    }

    // ─── Playback & home preferences (mirror the `settings` slice in useButuStore.ts) ──
    val autoSkipIntro: Flow<Boolean> = context.dataStore.data.map { it[Keys.AutoSkipIntro] ?: false }
    val autoSkipCredits: Flow<Boolean> = context.dataStore.data.map { it[Keys.AutoSkipCredits] ?: false }
    val autoPlayNext: Flow<Boolean> = context.dataStore.data.map { it[Keys.AutoPlayNext] ?: true }
    val showHero: Flow<Boolean> = context.dataStore.data.map { it[Keys.ShowHero] ?: true }
    val showContinueWatching: Flow<Boolean> = context.dataStore.data.map { it[Keys.ShowContinue] ?: true }
    val boostVoices: Flow<Boolean> = context.dataStore.data.map { it[Keys.BoostVoices] ?: true }

    suspend fun currentAutoSkipIntro(): Boolean = autoSkipIntro.first()
    suspend fun currentAutoSkipCredits(): Boolean = autoSkipCredits.first()
    suspend fun currentAutoPlayNext(): Boolean = autoPlayNext.first()
    suspend fun currentBoostVoices(): Boolean = boostVoices.first()

    suspend fun setAutoSkipIntro(v: Boolean) { context.dataStore.edit { it[Keys.AutoSkipIntro] = v } }
    suspend fun setAutoSkipCredits(v: Boolean) { context.dataStore.edit { it[Keys.AutoSkipCredits] = v } }
    suspend fun setAutoPlayNext(v: Boolean) { context.dataStore.edit { it[Keys.AutoPlayNext] = v } }
    suspend fun setShowHero(v: Boolean) { context.dataStore.edit { it[Keys.ShowHero] = v } }
    suspend fun setShowContinueWatching(v: Boolean) { context.dataStore.edit { it[Keys.ShowContinue] = v } }
    suspend fun setBoostVoices(v: Boolean) { context.dataStore.edit { it[Keys.BoostVoices] = v } }

    suspend fun clearAll() {
        context.dataStore.edit { it.clear() }
    }

    private inline fun <reified T> decodeOrNull(raw: String): T? =
        runCatching { json.decodeFromString<T>(raw) }
            .getOrElse { e ->
                if (e is SerializationException) null else throw e
            }

    private object Keys {
        val ServerType  = stringPreferencesKey("server_type")
        val Jellyfin    = stringPreferencesKey("jellyfin_config")
        val Plex        = stringPreferencesKey("plex_config")
        val AudioLang   = stringPreferencesKey("preferred_audio_lang")
        val SubLang     = stringPreferencesKey("preferred_subtitle_lang")
        val SubsEnabled = booleanPreferencesKey("subtitles_enabled")
        val AirMouseEnabled = booleanPreferencesKey("air_mouse_enabled")
        val AirMouseHost = stringPreferencesKey("air_mouse_host")
        val AutoSkipIntro = booleanPreferencesKey("auto_skip_intro")
        val AutoSkipCredits = booleanPreferencesKey("auto_skip_credits")
        val AutoPlayNext = booleanPreferencesKey("auto_play_next")
        val ShowHero = booleanPreferencesKey("show_hero")
        val ShowContinue = booleanPreferencesKey("show_continue")
        val BoostVoices = booleanPreferencesKey("boost_voices")
    }
}
