package dev.butu.data.markers

import dev.butu.BuildConfig
import dev.butu.data.markers.cloud.SupabaseMarkerApi
import dev.butu.data.markers.cloud.SupabaseMarkerDto
import dev.butu.domain.Marker
import dev.butu.domain.MarkerType
import retrofit2.Retrofit
import java.util.concurrent.ConcurrentHashMap
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Looks up intros/credits in the Butu cloud DB (Supabase). Used as a fallback
 * when the source backend didn't supply markers itself — i.e. free Plex (no
 * Pass) and Jellyfin without the IntroSkipper plugin.
 *
 * The marker DB is keyed by (provider, providerId, season, episode) where the
 * provider/id pair comes from Plex `<Guid>` or Jellyfin `ProviderIds` and is
 * normalised upstream as `tmdb://1399` / `imdb://tt0903747` strings.
 *
 * If `SUPABASE_URL` is blank (no .env configured), this source becomes a no-op
 * — the player just won't show Skip pills, and that's fine.
 */
@Singleton
class CloudMarkerSource @Inject constructor(
    retrofit: Retrofit,
) : MarkerSource {

    private val api: SupabaseMarkerApi = retrofit.create(SupabaseMarkerApi::class.java)
    private val cache = ConcurrentHashMap<String, List<Marker>>()

    override suspend fun fetchMarkers(target: MarkerTarget): List<Marker> {
        if (BuildConfig.SUPABASE_URL.isBlank() || BuildConfig.SUPABASE_ANON_KEY.isBlank()) {
            return emptyList()
        }
        // Try each (provider, id) in priority order. tmdb usually has the best coverage,
        // then tvdb (TV-only, but more granular for some shows), then imdb as a last resort.
        val keys = target.externalIds.mapNotNull { parseExternalId(it) }
            .sortedBy { providerPriority(it.first) }
        if (keys.isEmpty()) return emptyList()

        for ((provider, providerId) in keys) {
            val cacheKey = "$provider:$providerId:${target.season ?: "_"}:${target.episode ?: "_"}"
            cache[cacheKey]?.let { 
                android.util.Log.i("CloudMarkerSource", "Cache hit for $cacheKey -> ${it.size} markers")
                return it 
            }

            android.util.Log.i("CloudMarkerSource", "Querying Supabase for $cacheKey")
            val results = runCatching {
                queryMarkers(provider, providerId, target.season, target.episode)
            }.onFailure {
                android.util.Log.e("CloudMarkerSource", "queryMarkers failed for $cacheKey", it)
            }.getOrNull().orEmpty()

            android.util.Log.i("CloudMarkerSource", "queryMarkers returned ${results.size} markers for $cacheKey")
            cache[cacheKey] = results
            if (results.isNotEmpty()) return results
        }
        return emptyList()
    }

    private suspend fun queryMarkers(
        provider: String,
        providerId: String,
        season: Int?,
        episode: Int?,
    ): List<Marker> {
        val base = BuildConfig.SUPABASE_URL.trimEnd('/')
        val filters = buildMap {
            put("provider", "eq.$provider")
            put("provider_id", "eq.$providerId")
            put("season", if (season != null) "eq.$season" else "is.null")
            put("episode", if (episode != null) "eq.$episode" else "is.null")
        }
        val rows = api.queryMarkers(
            url = "$base/rest/v1/markers",
            headers = supabaseHeaders(),
            filters = filters,
        )
        return preferReal(rows).mapNotNull { it.toDomain() }
    }

    /**
     * The cloud DB carries bulk "seed" placeholder markers (flat, eyeballed
     * times duplicated across a whole season) alongside accurate per-episode
     * markers (auto-detected / user-submitted). Once a real marker exists for a
     * type the seed is pure noise — e.g. a flat 50:00 credits seed fires the
     * "Up Next" overlay minutes early on a 58:53 episode. So for each marker
     * type, drop the seed rows whenever a non-seed row of that type is present.
     * Seed-only coverage (a show with no real markers yet) is left untouched.
     */
    private fun preferReal(rows: List<SupabaseMarkerDto>): List<SupabaseMarkerDto> {
        val typesWithReal = rows.filterNot { it.isSeed }
            .map { it.markerType.lowercase() }
            .toSet()
        return rows.filterNot { it.isSeed && it.markerType.lowercase() in typesWithReal }
    }

    private val SupabaseMarkerDto.isSeed: Boolean
        get() = submittedBy?.equals("seed", ignoreCase = true) == true

    private fun supabaseHeaders(): Map<String, String> = mapOf(
        "apikey"        to BuildConfig.SUPABASE_ANON_KEY,
        "Authorization" to "Bearer ${BuildConfig.SUPABASE_ANON_KEY}",
        "Accept"        to "application/json",
    )

    /** Splits `tmdb://1399` → ("tmdb", "1399"). Returns null for malformed URIs. */
    private fun parseExternalId(uri: String): Pair<String, String>? {
        val idx = uri.indexOf("://")
        if (idx <= 0 || idx + 3 >= uri.length) return null
        val provider = uri.substring(0, idx).lowercase()
        val id = uri.substring(idx + 3).trim()
        if (id.isBlank()) return null
        if (provider !in SUPPORTED_PROVIDERS) return null
        return provider to id
    }

    private fun providerPriority(provider: String): Int = when (provider) {
        "tmdb" -> 0
        "tvdb" -> 1
        "imdb" -> 2
        else   -> 99
    }

    private fun SupabaseMarkerDto.toDomain(): Marker? {
        if (endMs <= startMs) return null
        val type = when (markerType.lowercase()) {
            "intro"   -> MarkerType.Intro
            "credits" -> MarkerType.Credits
            else      -> return null
        }
        return Marker(type = type, startMs = startMs, endMs = endMs)
    }

    companion object {
        private val SUPPORTED_PROVIDERS = setOf("tmdb", "tvdb", "imdb")
    }
}
