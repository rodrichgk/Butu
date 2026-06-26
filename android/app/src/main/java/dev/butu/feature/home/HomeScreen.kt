package dev.butu.feature.home

import android.app.Activity
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.ExperimentalAnimationApi
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PowerSettingsNew
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Text
import dev.butu.R
import dev.butu.domain.MediaItem
import dev.butu.navigation.Section
import dev.butu.ui.components.HeroCarousel
import dev.butu.ui.components.MediaStage
import dev.butu.ui.components.NavigationSidebar
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuShapes
import dev.butu.ui.theme.ButuType
import dev.butu.util.encodeQrCode
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.foundation.Image
import kotlinx.coroutines.delay

/**
 * Home shell: floating sidebar + scrollable main content.
 * Mirrors the App.tsx home state machine, including the TV back flow:
 * section -> Home -> exit confirmation.
 */
@Composable
fun HomeScreen(
    onItemSelect: (MediaItem) -> Unit,
    onPlay: (MediaItem) -> Unit,
    viewModel: HomeViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    var showExitDialog by rememberSaveable { mutableStateOf(false) }

    var activeSettingsDialog by remember { mutableStateOf<String?>(null) }
    var infoTitle by remember { mutableStateOf("") }
    var infoText by remember { mutableStateOf("") }

    BackHandler {
        when {
            activeSettingsDialog != null -> {
                activeSettingsDialog = null
            }
            showExitDialog -> (context as? Activity)?.finish()
            state.activeSection != Section.Home -> {
                showExitDialog = false
                viewModel.setActiveSection(Section.Home)
            }
            else -> showExitDialog = true
        }
    }

    LaunchedEffect(showExitDialog) {
        if (showExitDialog) {
            delay(4_000)
            showExitDialog = false
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(ButuColors.SurfaceLowest),
    ) {
        HomeContent(
            state = state,
            onItemSelect = onItemSelect,
            onPlay = onPlay,
            onDisconnect = viewModel::disconnect,
            onReloadLibrary = viewModel::refresh,
            onSetSubsEnabled = viewModel::setSubtitlesEnabled,
            onToggleSetting = { key, v ->
                when (key) {
                    "autoSkipIntro" -> viewModel.setAutoSkipIntro(v)
                    "autoSkipCredits" -> viewModel.setAutoSkipCredits(v)
                    "autoPlayNext" -> viewModel.setAutoPlayNext(v)
                    "boostVoices" -> viewModel.setBoostVoices(v)
                    "showHero" -> viewModel.setShowHero(v)
                    "showContinue" -> viewModel.setShowContinueWatching(v)
                }
            },
            onOpenDialog = { activeSettingsDialog = it },
            onOpenInfo = { title, text ->
                infoTitle = title
                infoText = text
                activeSettingsDialog = "info"
            },
            modifier = Modifier
                .fillMaxSize()
                .padding(start = 80.dp),
        )

        NavigationSidebar(
            activeSection = state.activeSection,
            onSectionChange = {
                showExitDialog = false
                viewModel.setActiveSection(it)
            },
            modifier = Modifier
                .align(Alignment.CenterStart)
                .padding(start = 14.dp),
        )

        if (showExitDialog) {
            ExitDialog(
                onStay = { showExitDialog = false },
                onExit = { (context as? Activity)?.finish() },
                modifier = Modifier
                    .align(Alignment.BottomCenter)
                    .padding(bottom = 52.dp),
            )
        }

        if (activeSettingsDialog != null) {
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .background(Color.Black.copy(alpha = 0.55f))
                    .clickable(
                        interactionSource = remember { MutableInteractionSource() },
                        indication = null,
                        onClick = { activeSettingsDialog = null }
                    ),
                contentAlignment = Alignment.Center
            ) {
                when (activeSettingsDialog) {
                    "audio" -> {
                        val currentLang = state.preferredAudioLanguage ?: ""
                        val audioLanguages = listOf(
                            stringResource(R.string.lang_default) to "",
                            stringResource(R.string.lang_en) to "en",
                            stringResource(R.string.lang_fr) to "fr",
                            stringResource(R.string.lang_ja) to "ja",
                            stringResource(R.string.lang_es) to "es",
                            stringResource(R.string.lang_de) to "de",
                            stringResource(R.string.lang_zh) to "zh",
                            stringResource(R.string.lang_ko) to "ko"
                        )
                        SettingsSelectionDialog(
                            title = stringResource(R.string.settings_audio_title),
                            options = audioLanguages,
                            selectedValue = currentLang,
                            onSelect = {
                                viewModel.setPreferredAudioLanguage(it.ifBlank { null })
                                activeSettingsDialog = null
                            },
                            onDismiss = { activeSettingsDialog = null }
                        )
                    }
                    "sub_lang" -> {
                        val currentLang = state.preferredSubtitleLanguage ?: ""
                        val subLanguages = listOf(
                            stringResource(R.string.lang_default) to "",
                            stringResource(R.string.lang_en) to "en",
                            stringResource(R.string.lang_fr) to "fr",
                            stringResource(R.string.lang_ja) to "ja",
                            stringResource(R.string.lang_es) to "es",
                            stringResource(R.string.lang_de) to "de",
                            stringResource(R.string.lang_zh) to "zh",
                            stringResource(R.string.lang_ko) to "ko"
                        )
                        SettingsSelectionDialog(
                            title = stringResource(R.string.settings_pref_sub_title),
                            options = subLanguages,
                            selectedValue = currentLang,
                            onSelect = {
                                viewModel.setPreferredSubtitleLanguage(it.ifBlank { null })
                                activeSettingsDialog = null
                            },
                            onDismiss = { activeSettingsDialog = null }
                        )
                    }
                    "air_mouse" -> {
                        SettingsAirMouseDialog(
                            state = state,
                            onToggleEnabled = { viewModel.setAirMouseEnabled(it) },
                            onDismiss = { activeSettingsDialog = null }
                        )
                    }
                    "info" -> {
                        SettingsInfoDialog(
                            title = infoTitle,
                            text = infoText,
                            onDismiss = { activeSettingsDialog = null }
                        )
                    }
                    "donate" -> {
                        SettingsDonateDialog(onDismiss = { activeSettingsDialog = null })
                    }
                }
            }
        }
    }
}

@OptIn(ExperimentalAnimationApi::class)
@Composable
private fun HomeContent(
    state: HomeUiState,
    onItemSelect: (MediaItem) -> Unit,
    onPlay: (MediaItem) -> Unit,
    onDisconnect: () -> Unit,
    onReloadLibrary: () -> Unit,
    onSetSubsEnabled: (Boolean) -> Unit,
    onToggleSetting: (String, Boolean) -> Unit,
    onOpenDialog: (String) -> Unit,
    onOpenInfo: (String, String) -> Unit,
    modifier: Modifier = Modifier,
) {
    AnimatedContent(
        targetState = state.activeSection,
        transitionSpec = {
            (fadeIn(tween(400)) + slideInVertically(tween(400)) { it / 8 })
                .togetherWith(fadeOut(tween(200)))
        },
        label = "home-section",
        modifier = modifier,
    ) { section ->
        when (section) {
            Section.Home -> HomeFeed(state, onItemSelect, onPlay)
            Section.Movies -> SectionScroll(
                heading = "Cinema",
                subhead = "${state.movies.size} TITLES - FILM LIBRARY",
                stageTitle = "All Movies",
                items = state.movies,
                onSelect = onItemSelect,
            )
            Section.Music -> SectionScroll(
                heading = "Sound Stage",
                subhead = "${state.music.size} ALBUMS - HI-FI AUDIO",
                stageTitle = "Albums",
                items = state.music,
                onSelect = onItemSelect,
            )
            Section.Tv -> SectionScroll(
                heading = "Prestige Television",
                subhead = "${state.tv.size} SERIES - STREAMING QUALITY",
                stageTitle = "Series",
                items = state.tv,
                onSelect = onItemSelect,
            )
            Section.Anime -> SectionScroll(
                heading = "Anime",
                subhead = "${state.anime.size} SERIES - SEASONS & EPISODES",
                stageTitle = "All Anime",
                items = state.anime,
                onSelect = onItemSelect,
            )
            Section.Manga -> SectionScroll(
                heading = "Manga",
                subhead = "${state.manga.size} TITLES - VOLUMES",
                stageTitle = "All Manga",
                items = state.manga,
                onSelect = onItemSelect,
            )
            Section.Search -> SearchContent(state = state, onItemSelect = onItemSelect)
            Section.Settings -> SettingsContent(
                state = state,
                onDisconnect = onDisconnect,
                onReloadLibrary = onReloadLibrary,
                onSetSubsEnabled = onSetSubsEnabled,
                onToggleSetting = onToggleSetting,
                onOpenDialog = onOpenDialog,
                onOpenInfo = onOpenInfo,
            )
        }
    }
}

@Composable
private fun HomeFeed(
    state: HomeUiState,
    onItemSelect: (MediaItem) -> Unit,
    onPlay: (MediaItem) -> Unit,
) {
    val screenHeight = LocalConfiguration.current.screenHeightDp.dp
    val heroHeight = (screenHeight * 0.55f).coerceAtLeast(480.dp)
    val scrollState = rememberLazyListState()

    LazyColumn(
        state = scrollState,
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(bottom = 80.dp),
    ) {
        if (state.showHero && state.heroSlides.isNotEmpty()) {
            item(key = "hero") {
                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(heroHeight)
                        .padding(bottom = 48.dp),
                ) {
                    HeroCarousel(
                        items = state.heroSlides,
                        onSelect = onItemSelect,
                        onPlay = onPlay,
                    )
                }
            }
        }

        if (state.showContinueWatching) {
            stage("continue-watching", "Continue Watching", "RESUME PLAYBACK", state.continueWatching, onItemSelect, uniform = true)
        }
        stage("cinema", "Cinema", "MOVIES - FILM LIBRARY", state.movies, onItemSelect)
        stage("tv", "Prestige Television", "TV SERIES - EPISODES", state.tv, onItemSelect)
        stage("anime", "Anime", "ANIME - SEASONS", state.anime, onItemSelect)
        stage("manga", "Manga", "MANGA - VOLUMES", state.manga, onItemSelect)
        stage("music", "Sound Stage", "MUSIC - ALBUMS", state.music, onItemSelect)

        if (state.isLibraryEmpty()) {
            item(key = "library-banner") { LibraryBanner(state) }
        }
    }
}

@Composable
private fun SearchContent(
    state: HomeUiState,
    onItemSelect: (MediaItem) -> Unit,
) {
    var query by rememberSaveable { mutableStateOf("") }
    val fieldRequester = remember { FocusRequester() }
    val normalized = query.trim()
    val results = remember(state.library, normalized) {
        if (normalized.isBlank()) {
            state.library.take(36)
        } else {
            val q = normalized.lowercase()
            state.library.filter { item ->
                item.title.contains(q, ignoreCase = true) ||
                    item.artist?.contains(q, ignoreCase = true) == true ||
                    item.album?.contains(q, ignoreCase = true) == true ||
                    item.genre.any { it.contains(q, ignoreCase = true) }
            }
        }
    }
    val quickGenres = remember(state.library) {
        state.library.flatMap { it.genre }
            .filter { it.isNotBlank() }
            .distinctBy { it.lowercase() }
            .take(8)
    }

    LaunchedEffect(Unit) {
        delay(120)
        fieldRequester.requestFocus()
    }

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 32.dp, bottom = 96.dp),
    ) {
        item(key = "search-head") {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 80.dp, end = 80.dp, bottom = 28.dp),
            ) {
                SectionHeading(
                    title = "Search",
                    subtitle = "${state.library.size} ITEMS - TITLE, ARTIST, GENRE",
                )
                Spacer(Modifier.height(24.dp))
                SearchField(
                    value = query,
                    onValueChange = { query = it },
                    modifier = Modifier.focusRequester(fieldRequester),
                )
                if (quickGenres.isNotEmpty()) {
                    Spacer(Modifier.height(16.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        quickGenres.forEach { genre ->
                            FilterChip(label = genre, selected = query.equals(genre, ignoreCase = true)) {
                                query = genre
                            }
                        }
                    }
                }
            }
        }

        if (results.isEmpty()) {
            item(key = "search-empty") {
                EmptyState(
                    title = "No matches",
                    subtitle = "Try a title, artist, album, or genre.",
                )
            }
        } else {
            item(key = "search-results") {
                MediaStage(
                    title = if (normalized.isBlank()) "Suggested" else "Search Results",
                    items = results,
                    onSelect = onItemSelect,
                    metaLabel = "${results.size} MATCHES",
                )
            }
        }
    }
}

@Composable
private fun SettingsContent(
    state: HomeUiState,
    onDisconnect: () -> Unit,
    onReloadLibrary: () -> Unit,
    onSetSubsEnabled: (Boolean) -> Unit,
    onToggleSetting: (String, Boolean) -> Unit,
    onOpenDialog: (String) -> Unit,
    onOpenInfo: (String, String) -> Unit,
) {
    val audioLanguagesMap = remember {
        mapOf("" to "Default", "en" to "English", "fr" to "French", "ja" to "Japanese", "es" to "Spanish", "de" to "German", "zh" to "Chinese", "ko" to "Korean")
    }
    val subtitleLanguagesMap = remember {
        mapOf("" to "Default", "en" to "English", "fr" to "French", "es" to "Spanish", "ja" to "Japanese", "de" to "German", "zh" to "Chinese", "ko" to "Korean")
    }
    
    val currentAudioLang = audioLanguagesMap[state.preferredAudioLanguage ?: ""] ?: "Default"
    val currentSubLang = subtitleLanguagesMap[state.preferredSubtitleLanguage ?: ""] ?: "Default"

    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 32.dp, bottom = 96.dp),
    ) {
        item(key = "settings-head") {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 80.dp, end = 80.dp, bottom = 28.dp),
            ) {
                SectionHeading(
                    title = "Settings",
                    subtitle = "SERVER, PLAYBACK, AIR MOUSE",
                )
                Spacer(Modifier.height(24.dp))
                ServerCard(state = state, onDisconnect = onDisconnect)
            }
        }

        item(key = "settings-list") {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 80.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                SettingsGroupLabel("PLAYBACK")
                SettingsRow(
                    title = "Preferred Audio Language",
                    subtitle = "Current: $currentAudioLang",
                    statusLabel = "SELECT",
                    onClick = { onOpenDialog("audio") }
                )
                SettingsRow(
                    title = "Subtitles",
                    subtitle = "Show subtitles by default when available",
                    statusLabel = if (state.subtitlesEnabled) "ENABLED" else "DISABLED",
                    onClick = { onSetSubsEnabled(!state.subtitlesEnabled) }
                )
                SettingsRow(
                    title = "Preferred Subtitle Language",
                    subtitle = "Current: $currentSubLang",
                    statusLabel = "SELECT",
                    onClick = { onOpenDialog("sub_lang") }
                )
                SettingsRow(
                    title = "Auto-skip intros",
                    subtitle = "Jump past detected intro markers automatically",
                    statusLabel = if (state.autoSkipIntro) "ON" else "OFF",
                    onClick = { onToggleSetting("autoSkipIntro", !state.autoSkipIntro) }
                )
                SettingsRow(
                    title = "Auto-skip credits",
                    subtitle = "Jump past end-credits automatically",
                    statusLabel = if (state.autoSkipCredits) "ON" else "OFF",
                    onClick = { onToggleSetting("autoSkipCredits", !state.autoSkipCredits) }
                )
                SettingsRow(
                    title = "Auto-play next episode",
                    subtitle = "Continue to the next episode when one ends",
                    statusLabel = if (state.autoPlayNext) "ON" else "OFF",
                    onClick = { onToggleSetting("autoPlayNext", !state.autoPlayNext) }
                )
                SettingsRow(
                    title = "Boost voices",
                    subtitle = "Downmix surround to stereo and lift dialogue so speech isn't drowned by effects",
                    statusLabel = if (state.boostVoices) "ON" else "OFF",
                    onClick = { onToggleSetting("boostVoices", !state.boostVoices) }
                )

                SettingsGroupLabel("HOME SCREEN")
                SettingsRow(
                    title = "Featured hero",
                    subtitle = "Show the large banner at the top of Home",
                    statusLabel = if (state.showHero) "ON" else "OFF",
                    onClick = { onToggleSetting("showHero", !state.showHero) }
                )
                SettingsRow(
                    title = "Continue Watching",
                    subtitle = "Show the resume rail on the Home screen",
                    statusLabel = if (state.showContinueWatching) "ON" else "OFF",
                    onClick = { onToggleSetting("showContinue", !state.showContinueWatching) }
                )

                val amIp = state.localIpAddress ?: "Unknown"
                val amStatus = if (state.airMouseEnabled) {
                    if (state.airMouseConnected) "CONNECTED (${state.airMouseClientAddress ?: "client"})" else "ACTIVE (ws://$amIp:9001)"
                } else {
                    "OFF"
                }
                SettingsGroupLabel("REMOTE")
                SettingsRow(
                    title = "Air Mouse Bridge",
                    subtitle = "Pair your phone as an inertial controller/remote",
                    statusLabel = amStatus,
                    onClick = { onOpenDialog("air_mouse") }
                )

                SettingsGroupLabel("LIBRARY")
                SettingsRow(
                    title = "Reload Library",
                    subtitle = "${state.libraryCount} items loaded · re-sync from media server",
                    statusLabel = if (state.isLoading) "LOADING…" else "RELOAD",
                    onClick = { if (!state.isLoading) onReloadLibrary() }
                )

                SettingsGroupLabel("DEVICE")
                SettingsRow(
                    title = "Display",
                    subtitle = "Native 120Hz Compose rendering",
                    statusLabel = "INFO",
                    onClick = {
                        onOpenInfo("Display Info", "Native 120Hz Compose rendering is active on the current display. Butu UI is fully optimized for fluid TV navigation transitions.")
                    }
                )
                SettingsRow(
                    title = "Appearance",
                    subtitle = "Butu Cinematic Aperture theme",
                    statusLabel = "INFO",
                    onClick = {
                        onOpenInfo("Theme Info", "Using Butu Cinematic Aperture premium dark theme. Featuring HSL calibrated visual balances, smooth gradients, and glassmorphic overlays.")
                    }
                )

                if (DONATE_ENABLED) {
                    SettingsGroupLabel("SUPPORT")
                    SettingsRow(
                        title = "Support Butu",
                        subtitle = "Butu is free. If it's useful to you, you can support development ❤",
                        statusLabel = "DONATE",
                        // QR dialog rather than a browser intent — most Android TVs have no browser.
                        onClick = { onOpenDialog("donate") }
                    )
                }

                Spacer(Modifier.height(20.dp))
                Text(
                    text = "v0.1.0",
                    color = ButuColors.OnSurface.copy(alpha = 0.22f),
                    style = ButuType.LabelMd.copy(fontSize = 11.sp),
                )
            }
        }
    }
}

// TODO: replace with your real donation link (Ko-fi / Buy Me a Coffee / GitHub Sponsors / PayPal).
// While it's the placeholder the Support row auto-hides, so we can ship before the link exists.
private const val DONATE_URL = "https://example.com/donate"
private val DONATE_ENABLED = !DONATE_URL.contains("example.com")

@Composable
private fun SettingsGroupLabel(text: String) {
    Text(
        text = text,
        color = ButuColors.NeonAura.copy(alpha = 0.55f),
        style = ButuType.LabelMd.copy(fontSize = 11.sp),
        modifier = Modifier.padding(top = 12.dp),
    )
}

private fun HomeUiState.isLibraryEmpty(): Boolean =
    movies.isEmpty() && tv.isEmpty() && anime.isEmpty() && manga.isEmpty() && music.isEmpty()

@Composable
private fun LibraryBanner(state: HomeUiState) {
    if (!state.isLoading && state.error == null) return
    Box(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 80.dp, vertical = 24.dp),
    ) {
        when {
            state.error != null -> Text(
                text = "Warning: ${state.error}",
                color = Color(0xFFFF6B6B),
                style = ButuType.LabelMd.copy(fontSize = 14.sp),
            )
            state.isLoading -> Text(
                text = "Loading library...",
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 14.sp),
            )
        }
    }
}

private fun androidx.compose.foundation.lazy.LazyListScope.stage(
    key: String,
    title: String,
    metaLabel: String,
    items: List<MediaItem>,
    onSelect: (MediaItem) -> Unit,
    uniform: Boolean = false,
) {
    if (items.isEmpty()) return
    item(key = key) {
        MediaStage(
            title = title,
            items = items,
            onSelect = onSelect,
            metaLabel = metaLabel,
            uniformPoster = uniform,
        )
    }
}

@Composable
private fun SectionScroll(
    heading: String,
    subhead: String,
    stageTitle: String,
    items: List<MediaItem>,
    onSelect: (MediaItem) -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(top = 32.dp, bottom = 80.dp),
    ) {
        item(key = "$heading-head") {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = 80.dp, end = 80.dp, bottom = 32.dp),
            ) {
                SectionHeading(title = heading, subtitle = subhead)
            }
        }
        if (items.isNotEmpty()) {
            item(key = "$heading-stage") {
                MediaStage(title = stageTitle, items = items, onSelect = onSelect)
            }
        } else {
            item(key = "$heading-empty") {
                EmptyState("Nothing here yet", "This section will fill when your server returns matching media.")
            }
        }
    }
}

@Composable
private fun SectionHeading(title: String, subtitle: String) {
    Text(
        text = title,
        color = ButuColors.OnSurface,
        style = ButuType.DisplaySm.copy(fontSize = 48.sp),
    )
    Spacer(Modifier.height(4.dp))
    Text(
        text = subtitle,
        color = ButuColors.OnSurfaceVariant,
        style = ButuType.LabelMd.copy(fontSize = 14.sp),
    )
}

@Composable
private fun SearchField(
    value: String,
    onValueChange: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        leadingIcon = {
            Icon(
                imageVector = Icons.Filled.Search,
                contentDescription = null,
                tint = ButuColors.Primary.copy(alpha = 0.75f),
            )
        },
        placeholder = {
            androidx.compose.material3.Text(
                text = "Search your library",
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.BodyMd,
            )
        },
        singleLine = true,
        textStyle = ButuType.BodyMd.copy(color = ButuColors.OnSurface),
        keyboardOptions = KeyboardOptions(
            keyboardType = KeyboardType.Text,
            imeAction = ImeAction.Search,
        ),
        keyboardActions = KeyboardActions(onSearch = {}),
        shape = RoundedCornerShape(18.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = ButuColors.SurfaceContainer.copy(alpha = 0.92f),
            unfocusedContainerColor = ButuColors.SurfaceContainer.copy(alpha = 0.76f),
            focusedBorderColor = ButuColors.Primary.copy(alpha = 0.55f),
            unfocusedBorderColor = ButuColors.OutlineVariant.copy(alpha = 0.45f),
            cursorColor = ButuColors.Primary,
            focusedTextColor = ButuColors.OnSurface,
            unfocusedTextColor = ButuColors.OnSurface,
        ),
        modifier = modifier
            .fillMaxWidth()
            .widthIn(max = 720.dp),
    )
}

@Composable
private fun FilterChip(
    label: String,
    selected: Boolean,
    onClick: () -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.06f else 1f,
        animationSpec = tween(140),
        label = "filter-chip-scale",
    )
    Text(
        text = label.uppercase(),
        color = if (selected || focused) ButuColors.Primary else ButuColors.OnSurfaceVariant,
        style = ButuType.LabelMd.copy(fontSize = 11.sp),
        modifier = Modifier
            .scale(scale)
            .background(
                color = if (selected) ButuColors.Primary.copy(alpha = 0.12f)
                else ButuColors.SurfaceContainer.copy(alpha = 0.70f),
                shape = CircleShape,
            )
            .border(
                width = 1.dp,
                color = if (selected || focused) ButuColors.Primary.copy(alpha = 0.30f)
                else ButuColors.OutlineVariant.copy(alpha = 0.30f),
                shape = CircleShape,
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 7.dp),
    )
}

@Composable
private fun ServerCard(
    state: HomeUiState,
    onDisconnect: () -> Unit,
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .widthIn(max = 760.dp)
            .background(ButuColors.GlassSm, ButuShapes.Glass)
            .border(1.dp, ButuColors.Primary.copy(alpha = 0.10f), ButuShapes.Glass)
            .padding(24.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(14.dp),
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(ButuColors.Primary.copy(alpha = 0.10f), CircleShape)
                    .border(1.dp, ButuColors.Primary.copy(alpha = 0.20f), CircleShape),
                contentAlignment = Alignment.Center,
            ) {
                Icon(
                    imageVector = Icons.Filled.Settings,
                    contentDescription = null,
                    tint = ButuColors.Primary,
                    modifier = Modifier.size(20.dp),
                )
            }
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = state.serverLabel ?: "NO SERVER",
                    color = ButuColors.Primary,
                    style = ButuType.LabelMd.copy(fontSize = 12.sp),
                )
                Text(
                    text = state.serverUrl ?: "Not connected",
                    color = ButuColors.OnSurface,
                    style = ButuType.HeadlineSm.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
                if (!state.serverUser.isNullOrBlank()) {
                    Text(
                        text = "Signed in as ${state.serverUser}",
                        color = ButuColors.OnSurfaceVariant,
                        style = ButuType.BodyMd.copy(fontSize = 13.sp),
                    )
                }
            }
            DisconnectButton(onClick = onDisconnect)
        }
    }
}

@Composable
private fun DisconnectButton(onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Row(
        modifier = Modifier
            .background(
                color = if (focused) Color(0xFFFF6B6B).copy(alpha = 0.16f)
                else Color.White.copy(alpha = 0.06f),
                shape = RoundedCornerShape(14.dp),
            )
            .border(
                width = 1.dp,
                color = if (focused) Color(0xFFFF6B6B).copy(alpha = 0.32f)
                else Color.White.copy(alpha = 0.10f),
                shape = RoundedCornerShape(14.dp),
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.PowerSettingsNew,
            contentDescription = null,
            tint = if (focused) Color(0xFFFF6B6B) else ButuColors.OnSurfaceVariant,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = "Disconnect",
            color = if (focused) Color(0xFFFF6B6B) else ButuColors.OnSurfaceVariant,
            style = ButuType.LabelLg.copy(fontSize = 13.sp),
        )
    }
}

@Composable
private fun SettingsRow(
    title: String,
    subtitle: String,
    statusLabel: String = "READY",
    onClick: () -> Unit = {}
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = if (focused) ButuColors.SurfaceContainerHigh.copy(alpha = 0.72f)
                else ButuColors.SurfaceContainer.copy(alpha = 0.42f),
                shape = RoundedCornerShape(16.dp),
            )
            .border(
                width = 1.dp,
                color = if (focused) ButuColors.Primary.copy(alpha = 0.18f)
                else ButuColors.OutlineVariant.copy(alpha = 0.22f),
                shape = RoundedCornerShape(16.dp),
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(
                text = title,
                color = ButuColors.OnSurface,
                style = ButuType.HeadlineSm.copy(fontSize = 16.sp, fontWeight = FontWeight.SemiBold),
            )
            Text(
                text = subtitle,
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.BodyMd.copy(fontSize = 13.sp),
            )
        }
        Text(
            text = statusLabel,
            color = if (focused) ButuColors.Primary else ButuColors.OnSurface.copy(alpha = 0.28f),
            style = ButuType.LabelMd.copy(fontSize = 11.sp),
        )
    }
}

@Composable
private fun SettingsSelectionDialog(
    title: String,
    options: List<Pair<String, String>>,
    selectedValue: String,
    onSelect: (String) -> Unit,
    onDismiss: () -> Unit,
) {
    val initialFocusIndex = remember(options, selectedValue) {
        val idx = options.indexOfFirst { it.second == selectedValue }
        if (idx >= 0) idx else 0
    }
    
    val focusRequesters = remember(options) {
        List(options.size) { FocusRequester() }
    }
    
    LaunchedEffect(Unit) {
        delay(100)
        runCatching {
            focusRequesters[initialFocusIndex].requestFocus()
        }
    }

    Column(
        modifier = Modifier
            .width(360.dp)
            .background(ButuColors.GlassSm, ButuShapes.Glass)
            .border(1.dp, ButuColors.Primary.copy(alpha = 0.15f), ButuShapes.Glass)
            .clickable(enabled = true, onClick = {})
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = title,
            color = ButuColors.OnSurface,
            style = ButuType.HeadlineSm.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(Modifier.height(16.dp))
        
        LazyColumn(
            verticalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth()
        ) {
            items(options.size) { idx ->
                val opt = options[idx]
                val source = remember { MutableInteractionSource() }
                val focused by source.collectIsFocusedAsState()
                val isSelected = opt.second == selectedValue
                
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .focusRequester(focusRequesters[idx])
                        .background(
                            color = if (focused) ButuColors.Primary.copy(alpha = 0.15f)
                            else if (isSelected) ButuColors.SurfaceContainer.copy(alpha = 0.4f)
                            else Color.Transparent,
                            shape = RoundedCornerShape(12.dp)
                        )
                        .border(
                            width = 1.dp,
                            color = if (focused) ButuColors.Primary.copy(alpha = 0.35f)
                            else Color.Transparent,
                            shape = RoundedCornerShape(12.dp)
                        )
                        .clickable(interactionSource = source, indication = null) {
                            onSelect(opt.second)
                        }
                        .padding(horizontal = 16.dp, vertical = 12.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Box(
                        modifier = Modifier
                            .size(8.dp)
                            .background(
                                color = if (isSelected) ButuColors.Primary else Color.Transparent,
                                shape = CircleShape
                            )
                            .border(
                                width = 1.dp,
                                color = if (isSelected) ButuColors.Primary else ButuColors.OnSurfaceVariant.copy(alpha = 0.4f),
                                shape = CircleShape
                            )
                    )
                    Spacer(Modifier.width(12.dp))
                    Text(
                        text = opt.first,
                        color = if (isSelected || focused) ButuColors.OnSurface else ButuColors.OnSurfaceVariant,
                        style = ButuType.BodyMd.copy(
                            fontWeight = if (isSelected) FontWeight.SemiBold else FontWeight.Normal,
                            fontSize = 14.sp
                        )
                    )
                }
            }
        }
    }
}

@Composable
private fun SettingsAirMouseDialog(
    state: HomeUiState,
    onToggleEnabled: (Boolean) -> Unit,
    onDismiss: () -> Unit,
) {
    val toggleRequester = remember { FocusRequester() }
    val ip = state.localIpAddress ?: "Unknown IP"
    val port = 9001
    val serverUrl = "ws://$ip:$port"
    
    val qrImage = remember(ip) {
        runCatching {
            encodeQrCode(serverUrl, 320)
        }.getOrNull()
    }
    
    LaunchedEffect(Unit) {
        delay(100)
        runCatching { toggleRequester.requestFocus() }
    }

    Column(
        modifier = Modifier
            .width(520.dp)
            .background(ButuColors.GlassSm, ButuShapes.Glass)
            .border(1.dp, ButuColors.Primary.copy(alpha = 0.15f), ButuShapes.Glass)
            .clickable(enabled = true, onClick = {})
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Air Mouse Bridge",
            color = ButuColors.OnSurface,
            style = ButuType.HeadlineSm.copy(fontSize = 20.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(Modifier.height(16.dp))
        
        val source = remember { MutableInteractionSource() }
        val focused by source.collectIsFocusedAsState()
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .focusRequester(toggleRequester)
                .background(
                    color = if (focused) ButuColors.Primary.copy(alpha = 0.15f)
                    else ButuColors.SurfaceContainer.copy(alpha = 0.4f),
                    shape = RoundedCornerShape(14.dp)
                )
                .border(
                    width = 1.dp,
                    color = if (focused) ButuColors.Primary.copy(alpha = 0.35f)
                    else ButuColors.OutlineVariant.copy(alpha = 0.15f),
                    shape = RoundedCornerShape(14.dp)
                )
                .clickable(interactionSource = source, indication = null) {
                    onToggleEnabled(!state.airMouseEnabled)
                }
                .padding(horizontal = 16.dp, vertical = 14.dp),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column {
                Text(
                    text = "Air Mouse Server",
                    color = ButuColors.OnSurface,
                    style = ButuType.HeadlineSm.copy(fontSize = 15.sp, fontWeight = FontWeight.SemiBold),
                )
                Text(
                    text = if (state.airMouseEnabled) "Background service is running" else "Server is stopped",
                    color = ButuColors.OnSurfaceVariant,
                    style = ButuType.BodyMd.copy(fontSize = 12.sp),
                )
            }
            Text(
                text = if (state.airMouseEnabled) "RUNNING" else "STOPPED",
                color = if (state.airMouseEnabled) ButuColors.Primary else ButuColors.OnSurface.copy(alpha = 0.28f),
                style = ButuType.LabelMd.copy(fontSize = 12.sp, fontWeight = FontWeight.Bold),
            )
        }
        
        if (state.airMouseEnabled) {
            Spacer(Modifier.height(20.dp))
            if (qrImage != null) {
                Box(
                    modifier = Modifier
                        .size(160.dp)
                        .background(Color.White, RoundedCornerShape(12.dp))
                        .padding(8.dp),
                    contentAlignment = Alignment.Center
                ) {
                    Image(
                        bitmap = qrImage,
                        contentDescription = "Pairing QR Code",
                        modifier = Modifier.fillMaxSize()
                    )
                }
            } else {
                Box(
                    modifier = Modifier
                        .size(160.dp)
                        .background(Color.White.copy(alpha = 0.05f), RoundedCornerShape(12.dp)),
                    contentAlignment = Alignment.Center
                ) {
                    Text(
                        text = "[QR Error]",
                        color = ButuColors.OnSurfaceVariant,
                        style = ButuType.BodyMd
                    )
                }
            }
            Spacer(Modifier.height(14.dp))
            Text(
                text = serverUrl,
                color = ButuColors.Primary,
                style = ButuType.LabelMd.copy(fontSize = 13.sp, fontWeight = FontWeight.Medium),
            )
            Spacer(Modifier.height(6.dp))
            Text(
                text = "Scan the QR code with your mobile web remote to pair. Active client: " +
                        (if (state.airMouseConnected) state.airMouseClientAddress ?: "connected" else "none"),
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.BodyMd.copy(fontSize = 12.sp),
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 12.dp)
            )
        } else {
            Spacer(Modifier.height(24.dp))
            Text(
                text = "Turn the server on to display pairing QR code.",
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.BodyMd.copy(fontSize = 13.sp),
                textAlign = TextAlign.Center
            )
        }
    }
}

@Composable
private fun SettingsInfoDialog(
    title: String,
    text: String,
    onDismiss: () -> Unit,
) {
    val okRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(100)
        runCatching { okRequester.requestFocus() }
    }
    Column(
        modifier = Modifier
            .width(420.dp)
            .background(ButuColors.GlassSm, ButuShapes.Glass)
            .border(1.dp, ButuColors.Primary.copy(alpha = 0.15f), ButuShapes.Glass)
            .clickable(enabled = true, onClick = {})
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = title,
            color = ButuColors.OnSurface,
            style = ButuType.HeadlineSm.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(Modifier.height(12.dp))
        Text(
            text = text,
            color = ButuColors.OnSurfaceVariant,
            style = ButuType.BodyMd.copy(fontSize = 14.sp),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 8.dp)
        )
        Spacer(Modifier.height(20.dp))
        
        val source = remember { MutableInteractionSource() }
        val focused by source.collectIsFocusedAsState()
        Box(
            modifier = Modifier
                .width(120.dp)
                .focusRequester(okRequester)
                .background(
                    color = if (focused) ButuColors.Primary.copy(alpha = 0.20f) else Color.White.copy(alpha = 0.06f),
                    shape = RoundedCornerShape(12.dp)
                )
                .border(
                    width = if (focused) 2.dp else 1.dp,
                    color = if (focused) ButuColors.Primary.copy(alpha = 0.85f) else Color.White.copy(alpha = 0.10f),
                    shape = RoundedCornerShape(12.dp)
                )
                .clickable(interactionSource = source, indication = null, onClick = onDismiss)
                .padding(vertical = 10.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Close",
                color = if (focused) ButuColors.Primary else ButuColors.OnSurfaceVariant,
                style = ButuType.LabelLg.copy(fontSize = 13.sp),
            )
        }
    }
}

@Composable
private fun SettingsDonateDialog(onDismiss: () -> Unit) {
    val okRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) { delay(100); runCatching { okRequester.requestFocus() } }
    val qr = remember { runCatching { encodeQrCode(DONATE_URL, 480) }.getOrNull() }

    Column(
        modifier = Modifier
            .width(420.dp)
            .background(ButuColors.GlassSm, ButuShapes.Glass)
            .border(1.dp, ButuColors.Primary.copy(alpha = 0.15f), ButuShapes.Glass)
            .clickable(enabled = true, onClick = {})
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Text(
            text = "Support Butu",
            color = ButuColors.OnSurface,
            style = ButuType.HeadlineSm.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Butu is free. Scan with your phone to support development ❤",
            color = ButuColors.OnSurfaceVariant,
            style = ButuType.BodyMd.copy(fontSize = 14.sp),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 8.dp)
        )
        Spacer(Modifier.height(18.dp))
        if (qr != null) {
            Image(
                bitmap = qr,
                contentDescription = "Donate QR code",
                modifier = Modifier
                    .size(220.dp)
                    .background(Color.White, RoundedCornerShape(12.dp))
                    .padding(10.dp)
            )
        } else {
            Text("[QR Error]", color = ButuColors.OnSurfaceVariant)
        }
        Spacer(Modifier.height(14.dp))
        Text(
            text = DONATE_URL,
            color = ButuColors.OnSurfaceVariant.copy(alpha = 0.7f),
            style = ButuType.LabelMd.copy(fontSize = 11.sp),
            textAlign = TextAlign.Center,
        )
        Spacer(Modifier.height(20.dp))

        val source = remember { MutableInteractionSource() }
        val focused by source.collectIsFocusedAsState()
        Box(
            modifier = Modifier
                .width(120.dp)
                .focusRequester(okRequester)
                .background(
                    color = if (focused) ButuColors.Primary.copy(alpha = 0.20f) else Color.White.copy(alpha = 0.06f),
                    shape = RoundedCornerShape(12.dp)
                )
                .border(
                    width = if (focused) 2.dp else 1.dp,
                    color = if (focused) ButuColors.Primary.copy(alpha = 0.85f) else Color.White.copy(alpha = 0.10f),
                    shape = RoundedCornerShape(12.dp)
                )
                .clickable(interactionSource = source, indication = null, onClick = onDismiss)
                .padding(vertical = 10.dp),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = "Close",
                color = if (focused) ButuColors.Primary else ButuColors.OnSurfaceVariant,
                style = ButuType.LabelLg.copy(fontSize = 13.sp),
            )
        }
    }
}

@Composable
private fun EmptyState(title: String, subtitle: String) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 80.dp, vertical = 52.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = title,
            color = ButuColors.OnSurface,
            style = ButuType.HeadlineMd,
        )
        Spacer(Modifier.height(8.dp))
        Text(
            text = subtitle,
            color = ButuColors.OnSurfaceVariant,
            style = ButuType.BodyMd,
        )
    }
}

@Composable
private fun ExitDialog(
    onStay: () -> Unit,
    onExit: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val stayRequester = remember { FocusRequester() }
    LaunchedEffect(Unit) {
        delay(80)
        runCatching { stayRequester.requestFocus() }
    }

    Column(
        modifier = modifier
            .shadow(32.dp, RoundedCornerShape(24.dp), clip = false)
            .background(Color(0xEE0E111B), RoundedCornerShape(24.dp))
            .border(1.dp, ButuColors.Primary.copy(alpha = 0.18f), RoundedCornerShape(24.dp))
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        Text(
            text = "Leave Butu?",
            color = ButuColors.OnSurface,
            style = ButuType.HeadlineSm.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(Modifier.height(6.dp))
        Text(
            text = "Press Back again to exit, or stay here.",
            color = ButuColors.OnSurfaceVariant,
            style = ButuType.BodyMd.copy(fontSize = 13.sp),
        )
        Spacer(Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            DialogAction(
                label = "Stay",
                accent = false,
                onClick = onStay,
                modifier = Modifier.focusRequester(stayRequester),
            )
            DialogAction(label = "Exit", accent = true, onClick = onExit)
        }
    }
}

@Composable
private fun DialogAction(
    label: String,
    accent: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val color = if (accent) Color(0xFFFF6B6B) else ButuColors.Primary
    Box(
        modifier = modifier
            .width(104.dp)
            .background(
                color = if (focused) color.copy(alpha = 0.20f) else Color.White.copy(alpha = 0.06f),
                shape = RoundedCornerShape(14.dp),
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) color.copy(alpha = 0.85f) else Color.White.copy(alpha = 0.10f),
                shape = RoundedCornerShape(14.dp),
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (focused) color else ButuColors.OnSurfaceVariant,
            style = ButuType.LabelLg.copy(fontSize = 13.sp),
        )
    }
}
