package dev.butu.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import androidx.navigation.navArgument
import dev.butu.feature.detail.DetailScreen
import dev.butu.feature.airmouse.AirMouseOverlayHost
import dev.butu.feature.home.HomeScreen
import dev.butu.feature.player.PlayerScreen
import dev.butu.feature.setup.SetupScreen
import dev.butu.feature.splash.SplashScreen
import dev.butu.ui.theme.ButuColors
import dev.butu.util.DebugLogger

/**
 * Top-level navigation. Mirrors the route tree implied by src/App.tsx state
 * machine: splash → (setup | home), home → detail, detail → player.
 */
@Composable
fun ButuNavHost(rootViewModel: RootViewModel = hiltViewModel()) {
    val navController = rememberNavController()
    val isConfigured by rootViewModel.isConfigured.collectAsStateWithLifecycle()
    val isReady by rootViewModel.isReady.collectAsStateWithLifecycle()
    val backStackEntry by navController.currentBackStackEntryAsState()
    val context = LocalContext.current

    LaunchedEffect(navController) {
        navController.addOnDestinationChangedListener { _, destination, arguments ->
            val argsStr = arguments?.let { args ->
                args.keySet().joinToString(", ") { key -> "$key=${args.get(key)}" }
            } ?: "none"
            DebugLogger.log(context, "Navigated to: ${destination.route} | args: $argsStr")
        }
    }

    LaunchedEffect(isConfigured, backStackEntry?.destination?.route) {
        if (isConfigured == false && backStackEntry?.destination?.route == ButuDestination.Home) {
            navController.navigate(ButuDestination.Setup) {
                popUpTo(ButuDestination.Home) { inclusive = true }
            }
        }
    }

    Box(modifier = Modifier.fillMaxSize().background(ButuColors.SurfaceLowest)) {
        NavHost(
            navController = navController,
            startDestination = ButuDestination.Splash,
            modifier = Modifier.fillMaxSize(),
        ) {
            composable(ButuDestination.Splash) {
                SplashScreen(
                    onComplete = {
                        val next = if (isConfigured == true) ButuDestination.Home else ButuDestination.Setup
                        DebugLogger.log(context, "Splash complete. Navigating to: $next")
                        navController.navigate(next) {
                            popUpTo(ButuDestination.Splash) { inclusive = true }
                        }
                    },
                    // Hold the splash until the library refresh has settled, so the home
                    // screen lands fully populated rather than flashing "Loading library…".
                    isReady = isReady,
                )
            }

            composable(ButuDestination.Setup) {
                SetupScreen(
                    onCompleted = {
                        DebugLogger.log(context, "Setup Screen complete. Navigating to Home.")
                        navController.navigate(ButuDestination.Home) {
                            popUpTo(ButuDestination.Setup) { inclusive = true }
                        }
                    },
                )
            }

            composable(ButuDestination.Home) {
                HomeScreen(
                    onItemSelect = { item ->
                        DebugLogger.log(context, "Home item select: ${item.id} -> Navigating to Detail")
                        navController.navigate(ButuDestination.detail(item.id))
                    },
                    onPlay = { item ->
                        DebugLogger.log(context, "Home quick play: ${item.id} -> Navigating to Player")
                        navController.navigate(ButuDestination.player(item.id))
                    },
                )
            }

            composable(
                route = ButuDestination.Detail,
                arguments = listOf(navArgument("itemId") { type = NavType.StringType })
            ) {
                DetailScreen(
                    onClose = {
                        DebugLogger.log(context, "DetailScreen onClose triggered -> Popping backstack")
                        navController.popBackStack()
                    },
                    onPlay = { itemId, startMs, episodeId ->
                        DebugLogger.log(context, "DetailScreen onPlay triggered for itemId=$itemId, startMs=$startMs, epId=$episodeId -> Navigating to Player")
                        navController.navigate(ButuDestination.player(itemId, startMs, episodeId))
                    },
                )
            }

            composable(
                route = ButuDestination.Player,
                arguments = listOf(
                    navArgument("itemId")    { type = NavType.StringType },
                    navArgument("startMs")   { type = NavType.LongType;   defaultValue = 0L },
                    navArgument("episodeId") { type = NavType.StringType; defaultValue = "" },
                )
            ) {
                PlayerScreen(onClose = {
                    DebugLogger.log(context, "PlayerScreen onClose callback triggered -> Popping backstack")
                    navController.popBackStack()
                })
            }
        }

        AirMouseOverlayHost()
    }
}
