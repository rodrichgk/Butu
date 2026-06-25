package dev.butu

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.core.view.WindowCompat
import androidx.lifecycle.lifecycleScope
import dagger.hilt.android.AndroidEntryPoint
import dev.butu.data.config.ConfigStore
import dev.butu.data.config.PlexConfig
import dev.butu.data.config.ServerType
import dev.butu.navigation.ButuNavHost
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuTheme
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject lateinit var configStore: ConfigStore

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        WindowCompat.setDecorFitsSystemWindows(window, false)

        // Dev-only auto-login from build config (no-op if already configured). The BuildConfig.DEBUG
        // guard is belt-and-braces: release builds also strip the token to "" (see build.gradle.kts),
        // so a public build never ships the dev's Plex credentials or auto-connects to their server.
        if (BuildConfig.DEBUG && BuildConfig.PLEX_TOKEN.isNotEmpty()) {
            lifecycleScope.launch { seedBuildConfig() }
        }

        setContent {
            ButuTheme {
                ButuRoot()
            }
        }
    }

    private suspend fun seedBuildConfig() {
        if (configStore.currentServerType() != null) return  // already configured, don't overwrite
        configStore.setPlex(
            PlexConfig(
                serverUrl = BuildConfig.PLEX_SERVER_URL,
                token     = BuildConfig.PLEX_TOKEN,
            )
        )
        configStore.setServerType(ServerType.Plex)
    }
}

@Composable
private fun ButuRoot() {
    androidx.compose.foundation.layout.Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ButuColors.SurfaceLowest)
    ) {
        ButuNavHost()
    }
}
