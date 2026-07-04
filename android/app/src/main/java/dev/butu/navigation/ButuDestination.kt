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
    const val Remote = "remote"         // this device driving another Butu screen

    fun detail(itemId: String) = "detail/$itemId"
    fun player(itemId: String, startMs: Long = 0L, episodeId: String? = null): String {
        val ep = episodeId.orEmpty()
        return "player/$itemId?startMs=$startMs&episodeId=$ep"
    }
}

/** Top-level sections — drives the sidebar `activeSection` in src/store/useButuStore.ts. */
enum class Section(val route: String, @androidx.annotation.StringRes val labelRes: Int) {
    Home("home", dev.butu.R.string.nav_home),
    Movies("movies", dev.butu.R.string.nav_movies),
    Music("music", dev.butu.R.string.nav_music),
    Tv("tv", dev.butu.R.string.nav_tv),
    Anime("anime", dev.butu.R.string.nav_anime),
    Manga("manga", dev.butu.R.string.nav_manga),
    Search("search", dev.butu.R.string.nav_search),
    Settings("settings", dev.butu.R.string.nav_settings);
}
