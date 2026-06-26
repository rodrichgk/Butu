package dev.butu.data.markers.cloud

import retrofit2.http.GET
import retrofit2.http.HeaderMap
import retrofit2.http.Query
import retrofit2.http.QueryMap
import retrofit2.http.Url

/**
 * Talks directly to Supabase PostgREST — no edge functions in between. The
 * REST surface for a single table is auto-generated; we only need one call.
 *
 *     GET /rest/v1/markers
 *         ?provider=eq.tmdb
 *         &provider_id=eq.1399
 *         &season=eq.1            (or season=is.null for movies)
 *         &episode=eq.1           (or episode=is.null)
 *         &select=marker_type,start_ms,end_ms
 *
 * The provider/episode filters are passed via `@QueryMap` because the season
 * lookup switches between `eq.<n>` and `is.null` depending on whether the
 * playback is a movie. PostgREST treats them as different operators.
 */
interface SupabaseMarkerApi {

    @GET
    suspend fun queryMarkers(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
        @QueryMap filters: Map<String, String>,
        @Query("select") select: String = "marker_type,start_ms,end_ms,submitted_by",
    ): List<SupabaseMarkerDto>
}
