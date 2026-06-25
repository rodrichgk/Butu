package dev.butu.data.plex

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HeaderMap
import retrofit2.http.POST
import retrofit2.http.Url

/** Mirrors the HTTP surface in src/services/plexApi.ts. */
interface PlexApi {

    @GET
    suspend fun getEnvelope(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
    ): PlexEnvelope

    @POST
    suspend fun signIn(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
        @Body body: PlexSignInBody,
    ): PlexSignInResponse

    /**
     * Creates a plex.tv linking PIN. Pair with `getPin` for polling.
     * Use the default (4-character) code — `strong=true` yields a 25-char code that
     * plex.tv/link won't accept for linking.
     */
    @POST
    suspend fun createPin(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
    ): PlexPinDto

    /** Polls the linking PIN until `authToken` is populated. */
    @GET
    suspend fun getPin(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
    ): PlexPinDto

    /** Lists every server the token can reach (owned + shared), with connection URIs. */
    @GET
    suspend fun getResources(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
    ): List<PlexResourceDto>
}

@kotlinx.serialization.Serializable
data class PlexSignInBody(
    val login: String,
    val password: String,
)
