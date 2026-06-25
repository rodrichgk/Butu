package dev.butu.navigation

/**
 * Routes mirror the navigation states in src/App.tsx.
 * The React app keeps everything in component state — we lift those flags into
 * route arguments so the back stack is restorable & deep-linkable.
 */
object ButuDestination {
    const val Splash = "splash"
    const val Setup  = "setup"
    const val Home   = "home"           // sections: home / movies / music / tv / anime / manga
    const val Detail = "detail/{itemId}"
    const val Player = "player/{itemId}?startMs={startMs}&episodeId={episodeId}"

    fun detail(itemId: String) = "detail/$itemId"
    fun player(itemId: String, startMs: Long = 0L, episodeId: String? = null): String {
        val ep = episodeId.orEmpty()
        return "player/$itemId?startMs=$startMs&episodeId=$ep"
    }
}

/** Top-level sections — drives the sidebar `activeSection` in src/store/useButuStore.ts. */
enum class Section(val route: String, val label: String) {
    Home("home", "Home"),
    Movies("movies", "Movies"),
    Music("music", "Music"),
    Tv("tv", "TV Shows"),
    Anime("anime", "Anime"),
    Manga("manga", "Manga"),
    Search("search", "Search"),
    Settings("settings", "Settings");
}
