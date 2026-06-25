package dev.butu.data.jellyfin

import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.HeaderMap
import retrofit2.http.POST
import retrofit2.http.Query
import retrofit2.http.Url

/**
 * Mirrors the HTTP surface in src/services/jellyfinApi.ts.
 * Each call takes a full `@Url` because the server URL is user-supplied.
 */
interface JellyfinApi {

    @GET
    suspend fun getItems(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
        @Query("IncludeItemTypes") includeItemTypes: String = "Movie,Series,Audio",
        @Query("Recursive") recursive: Boolean = true,
        @Query("Fields") fields: String = JELLYFIN_LIBRARY_FIELDS,
        @Query("SortBy") sortBy: String = "SortName",
        @Query("SortOrder") sortOrder: String = "Ascending",
        @Query("Limit") limit: Int = 500,
    ): JellyfinItemsResponse

    @GET
    suspend fun getEpisodes(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
        @Query("UserId") userId: String,
        @Query("Fields") fields: String = "Overview,MediaSources,UserData,RunTimeTicks,ProviderIds",
        @Query("SortBy") sortBy: String = "ParentIndexNumber,IndexNumber",
        @Query("Limit") limit: Int = 500,
    ): JellyfinItemsResponse

    @POST
    suspend fun authenticate(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
        @Body body: AuthenticateBody,
    ): JellyfinAuthResponse

    @GET
    suspend fun systemPublicInfo(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
    ): JellyfinPublicInfo

    @POST
    suspend fun quickConnectInitiate(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
    ): JellyfinQuickConnectState

    @GET
    suspend fun quickConnectConnect(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
        @Query("Secret") secret: String,
    ): JellyfinQuickConnectState

    @POST
    suspend fun authenticateWithQuickConnect(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
        @Body body: QuickConnectAuthBody,
    ): JellyfinAuthResponse

    @POST
    suspend fun reportPlayingStart(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
        @Body body: PlayingStartBody,
    )

    @POST
    suspend fun reportPlayingProgress(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
        @Body body: PlayingProgressBody,
    )

    @POST
    suspend fun reportPlayingStopped(
        @Url url: String,
        @HeaderMap headers: Map<String, String>,
        @Body body: PlayingStoppedBody,
    )
}

@kotlinx.serialization.Serializable
data class AuthenticateBody(
    @kotlinx.serialization.SerialName("Username") val username: String,
    @kotlinx.serialization.SerialName("Pw") val password: String,
)

@kotlinx.serialization.Serializable
data class PlayingStartBody(
    @kotlinx.serialization.SerialName("ItemId") val itemId: String,
    @kotlinx.serialization.SerialName("PositionTicks") val positionTicks: Long,
    @kotlinx.serialization.SerialName("CanSeek") val canSeek: Boolean = true,
)

@kotlinx.serialization.Serializable
data class PlayingProgressBody(
    @kotlinx.serialization.SerialName("ItemId") val itemId: String,
    @kotlinx.serialization.SerialName("PositionTicks") val positionTicks: Long,
    @kotlinx.serialization.SerialName("IsPaused") val isPaused: Boolean,
)

@kotlinx.serialization.Serializable
data class PlayingStoppedBody(
    @kotlinx.serialization.SerialName("ItemId") val itemId: String,
    @kotlinx.serialization.SerialName("PositionTicks") val positionTicks: Long,
)

@kotlinx.serialization.Serializable
data class QuickConnectAuthBody(
    @kotlinx.serialization.SerialName("Secret") val secret: String,
)

private const val JELLYFIN_LIBRARY_FIELDS =
    "Overview,Genres,GenreItems,MediaSources,BackdropImageTags,UserData,RunTimeTicks,ImageTags,ProviderIds"
