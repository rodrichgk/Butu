package dev.butu.data.media

import dev.butu.data.config.ConfigStore
import dev.butu.data.config.ServerType
import dev.butu.data.jellyfin.JellyfinRepository
import dev.butu.data.plex.PlexRepository
import dev.butu.data.plex.toEpisode
import dev.butu.data.plex.toMediaItem
import dev.butu.domain.Episode
import dev.butu.domain.MediaItem
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Surface that the rest of the app reads media through.
 * Picks the active backend based on `ConfigStore.serverType` and translates
 * raw responses to domain `MediaItem`s.
 */
@Singleton
class MediaRepository @Inject constructor(
    private val configStore: ConfigStore,
    private val jellyfin: JellyfinRepository,
    private val plex: PlexRepository,
) {
    private val _library = MutableStateFlow<List<MediaItem>>(emptyList())
    val library: StateFlow<List<MediaItem>> = _library.asStateFlow()

    fun findItem(id: String): MediaItem? = _library.value.firstOrNull { it.id == id }

    /**
     * True when the user has finished setup (server type + matching config present).
     * Mirrors the early-return guard in src/App.tsx that gates on the same check.
     */
    val isConfigured: Flow<Boolean> = combine(
        configStore.serverType,
        configStore.jellyfin,
        configStore.plex,
    ) { type, j, p ->
        when (type) {
            ServerType.Jellyfin -> j != null
            ServerType.Plex     -> p != null
            null                -> false
        }
    }.distinctUntilChanged()

    /** One-shot library refresh — call from a `viewModelScope` coroutine. */
    suspend fun refreshLibrary(): Result<Unit> = runCatching {
        val items = when (configStore.currentServerType()) {
            ServerType.Jellyfin -> {
                val cfg = configStore.currentJellyfin()
                    ?: error("Jellyfin selected but no config saved")
                jellyfin.fetchLibrary(cfg)
            }
            ServerType.Plex -> {
                val cfg = configStore.currentPlex()
                    ?: error("Plex selected but no config saved")
                plex.fetchLibrary(cfg)
            }
            null -> emptyList()
        }
        _library.value = items
    }

    suspend fun fetchEpisodes(seriesId: String, plexShowKey: String? = null): List<Episode> =
        when (configStore.currentServerType()) {
            ServerType.Jellyfin -> jellyfin.fetchEpisodes(
                cfg = configStore.currentJellyfin() ?: error("Jellyfin not configured"),
                seriesId = seriesId,
            )
            ServerType.Plex -> plex.fetchEpisodes(
                cfg = configStore.currentPlex() ?: error("Plex not configured"),
                showKey = plexShowKey ?: error("Plex episodes need showKey"),
            )
            null -> emptyList()
        }

    suspend fun fetchItemMetadata(item: MediaItem, episode: Episode?): MediaItem {
        val server = configStore.currentServerType()
        if (server == ServerType.Plex) {
            val cfg = configStore.currentPlex() ?: return item
            // If it's an episode, fetch the episode's metadata. Otherwise fetch the movie's.
            val ratingKey = episode?.id ?: item.id
            val plexItem = plex.fetchItemMetadata(cfg, ratingKey) ?: return item
            
            if (episode != null) {
                // Return a fake MediaItem holding the episode's updated tracks
                return item.copy(tracks = plexItem.toEpisode(cfg).tracks)
            } else {
                return plexItem.toMediaItem(cfg)
            }
        }
        // Jellyfin already has streams in the item/episode
        return item.copy(tracks = episode?.tracks?.takeIf { it.isNotEmpty() } ?: item.tracks)
    }

    suspend fun selectTrack(item: MediaItem, episode: Episode?, trackId: String, type: dev.butu.domain.TrackType) {
        val server = configStore.currentServerType()
        if (server == ServerType.Plex) {
            val cfg = configStore.currentPlex() ?: return
            val partId = episode?.partKey ?: item.plexPartKey ?: return
            plex.selectTrack(cfg, partId, trackId, type)
        }
    }

    suspend fun getStreamUrl(item: MediaItem, audioTrackId: String?, subtitleTrackId: String?): String? {
        val server = configStore.currentServerType()
        if (server == ServerType.Jellyfin) {
            val cfg = configStore.currentJellyfin() ?: return null
            val id = item.jellyfinId ?: item.id
            return dev.butu.data.jellyfin.jellyfinStreamUrl(
                cfg, id, audioTrackId, subtitleTrackId, configStore.currentBoostVoices(),
            )
        }
        // Plex tracks are stateful server-side, URL doesn't need to change.
        return item.streamUrl
    }

    suspend fun getEpisodeStreamUrl(episode: Episode, audioTrackId: String?, subtitleTrackId: String?): String? {
        val server = configStore.currentServerType()
        if (server == ServerType.Jellyfin) {
            val cfg = configStore.currentJellyfin() ?: return null
            return dev.butu.data.jellyfin.jellyfinStreamUrl(
                cfg, episode.id, audioTrackId, subtitleTrackId, configStore.currentBoostVoices(),
            )
        }
        return episode.streamUrl
    }
}
