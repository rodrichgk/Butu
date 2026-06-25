package dev.butu.feature.player

import android.view.SurfaceView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.VolumeOff
import androidx.compose.material.icons.automirrored.filled.VolumeUp
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.ClosedCaption
import androidx.compose.material.icons.filled.Forward10
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Replay10
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.foundation.focusGroup
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.key.Key
import androidx.compose.ui.input.key.KeyEventType
import androidx.compose.ui.input.key.key
import androidx.compose.ui.input.key.onKeyEvent
import androidx.compose.ui.input.key.onPreviewKeyEvent
import androidx.compose.ui.input.key.type
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Text
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuType
import dev.butu.util.DebugLogger
import kotlinx.coroutines.delay

private const val CONTROLS_AUTO_HIDE_MS = 3_500L
private const val SEEK_STEP_MS = 10_000L

@Composable
fun PlayerScreen(
    onClose: () -> Unit,
    viewModel: PlayerViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    val ambient = remember(state.ambientColor) {
        parseHexColorOr(state.ambientColor, ButuColors.NeonAura)
    }

    var showControls by remember { mutableStateOf(true) }
    var showTracks by remember { mutableStateOf(false) }
    var controlsResetTick by remember { mutableStateOf(0) }
    val resetControls: () -> Unit = remember { { showControls = true; controlsResetTick++ } }

    LaunchedEffect(controlsResetTick, state.isPlaying, showTracks) {
        if (!state.isPlaying || showTracks) return@LaunchedEffect
        delay(CONTROLS_AUTO_HIDE_MS)
        showControls = false
    }

    val playRequester = remember { FocusRequester() }
    val rootRequester = remember { FocusRequester() }
    LaunchedEffect(state.item?.id) {
        if (state.item != null) {
            delay(120)
            runCatching { playRequester.requestFocus() }
        }
    }
    LaunchedEffect(showControls) {
        if (showControls) {
            delay(150)
            runCatching { playRequester.requestFocus() }
        } else {
            // When controls hide, hand focus back to the root so any key press wakes them up.
            runCatching { rootRequester.requestFocus() }
        }
    }
    LaunchedEffect(showTracks) {
        if (!showTracks && showControls) {
            // The tracks panel keeps its focus trap (exit = Cancel) composed through its
            // ~150ms exit animation, then unmounts — both of which swallow focus on close.
            // An immediate single requestFocus races that and loses, so re-assert focus on
            // the controls a few times across the panel's exit + unmount instead of once.
            repeat(4) {
                delay(70)
                runCatching { playRequester.requestFocus() }
            }
        }
    }

    ImmersiveMode()
    PlaybackLifecycleHandler(viewModel)

    // Belt-and-braces: persist progress whenever the player leaves the composition,
    // regardless of how (Back, system kill, route change, configuration restart).
    // viewModel.onClosing() routes through the app-scope coroutine so the write
    // survives VM teardown.
    DisposableEffect(viewModel) {
        DebugLogger.log(context, "PlayerScreen: Mounted / Lifecycle started")
        onDispose {
            DebugLogger.log(context, "PlayerScreen: Disposed / Lifecycle ended")
            viewModel.onClosing()
        }
    }

    // One-shot guard: if something (click + lingering key event, focus change,
    // recomposition race) ever invokes `close` twice in a row, the second call must
    // not pop the back stack again — that's what was emptying the stack and finishing
    // the Activity when clicking the top-left back button.
    val closedOnce = remember { mutableStateOf(false) }
    val close: () -> Unit = remember {
        {
            DebugLogger.log(context, "PlayerScreen: close() called. closedOnce=${closedOnce.value}")
            if (!closedOnce.value) {
                closedOnce.value = true
                DebugLogger.log(context, "PlayerScreen: executing close() block")
                viewModel.onClosing()
                onClose()
            } else {
                DebugLogger.log(context, "PlayerScreen: close() ignored (already closed)")
            }
        }
    }

    // Handles system gestures, accessibility actions, or AirMouse back events.
    // D-pad/remote key events are intercepted and consumed separately below in onPreviewKeyEvent.
    BackHandler {
        DebugLogger.log(context, "PlayerScreen: BackHandler triggered. showTracks=$showTracks, showControls=$showControls")
        when {
            showTracks   -> { showTracks = false; resetControls() }
            showControls -> { showControls = false }
            else         -> { close() }
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black)
            .focusRequester(rootRequester)
            .focusable()
            .onPreviewKeyEvent { event ->
                val keyName = event.key.toString()
                val eventType = event.type.toString()
                // Log all remote/keyboard key events for debugging.
                DebugLogger.log(context, "PlayerScreen: onPreviewKeyEvent - key=$keyName, type=$eventType")

                // Always consume Back and Escape for both KeyDown and KeyUp events.
                // If we let KeyUp bubble up, the Activity's default back handling
                // will fire on the newly focused screen (DetailScreen), popping it
                // and exiting the app/details screen.
                if (event.key == Key.Back || event.key == Key.Escape) {
                    DebugLogger.log(context, "PlayerScreen: Intercepted Back/Escape key event type: $eventType")
                    if (event.type == KeyEventType.KeyDown) {
                        DebugLogger.log(context, "PlayerScreen: Processing Back/Escape KeyDown. showTracks=$showTracks, showControls=$showControls")
                        when {
                            showTracks   -> { showTracks = false; resetControls() }
                            showControls -> { showControls = false }
                            else         -> { close() }
                        }
                    }
                    DebugLogger.log(context, "PlayerScreen: Consumed Back/Escape key event")
                    return@onPreviewKeyEvent true
                }
                false
            }
            .onKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onKeyEvent false
                val keyName = event.key.toString()
                DebugLogger.log(context, "PlayerScreen: Processing non-back KeyDown event: key=$keyName")
                when (event.key) {
                    // Dedicated play/pause keys always toggle, regardless of focus.
                    Key.Spacebar, Key.MediaPlayPause -> {
                        if (!showControls) { resetControls(); return@onKeyEvent true }
                        viewModel.togglePlayPause(); resetControls(); true
                    }
                    Key.MediaRewind -> { viewModel.seekBy(-SEEK_STEP_MS); resetControls(); true }
                    Key.MediaFastForward -> { viewModel.seekBy(SEEK_STEP_MS); resetControls(); true }
                    Key.Enter -> {
                        if (!showControls) { resetControls(); return@onKeyEvent true }
                        viewModel.togglePlayPause(); resetControls(); true
                    }
                    // OK / Enter / arrows: must propagate to the focused control. Reset the
                    // auto-hide timer though — any user activity should refresh the 5s window.
                    Key.DirectionCenter,
                    Key.DirectionLeft, Key.DirectionRight, Key.DirectionUp, Key.DirectionDown -> {
                        if (!showControls) { resetControls(); true } else { resetControls(); false }
                    }
                    else -> {
                        if (!showControls) { resetControls(); true } else { resetControls(); false }
                    }
                }
            },
    ) {
        AmbientGlow(ambient)
        VideoSurface(viewModel)

        if (state.isBuffering) {
            androidx.compose.material3.CircularProgressIndicator(
                color = ButuColors.NeonAura,
                modifier = Modifier
                    .align(Alignment.Center)
                    .size(64.dp)
            )
        }

        AnimatedVisibility(
            visible = showControls,
            enter = fadeIn(tween(200)),
            exit = fadeOut(tween(200)),
        ) {
            ControlsOverlay(
                state = state,
                ambient = ambient,
                playRequester = playRequester,
                onClose = close,
                onTogglePlay = { viewModel.togglePlayPause(); resetControls() },
                onSeekBy = { delta -> viewModel.seekBy(delta); resetControls() },
                onSeekTo = { ms -> viewModel.seekTo(ms); resetControls() },
                onToggleMute = { viewModel.setMuted(!state.isMuted); resetControls() },
                onOpenTracks = { showTracks = true; resetControls() },
            )
        }

        if (state.showUpNext && state.nextEpisode != null) {
            UpNextCard(
                next = state.nextEpisode!!,
                ambient = ambient,
                onPlayNow = { viewModel.playNext() },
                onDismiss = { viewModel.dismissUpNext() },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 64.dp, bottom = 220.dp),
            )
        } else if (state.activeMarker != null) {
            // No up-next overlay (e.g. intro marker, or credits with no next episode) —
            // surface a small Skip pill instead.
            SkipMarkerButton(
                marker = state.activeMarker!!,
                ambient = ambient,
                onSkip = {
                    viewModel.skipMarker()
                    runCatching { playRequester.requestFocus() }
                },
                modifier = Modifier
                    .align(Alignment.BottomEnd)
                    .padding(end = 64.dp, bottom = 220.dp),
            )
        }

        AnimatedVisibility(
            visible = showTracks,
            enter = fadeIn(tween(200)),
            exit = fadeOut(tween(150)),
        ) {
            TracksPanel(
                audio = state.audioTracks,
                subtitles = state.subtitleTracks,
                subtitlesDisabled = state.subtitlesDisabled,
                ambient = ambient,
                onSelectAudio = { opt -> viewModel.selectAudioTrack(opt); resetControls() },
                onSelectSubtitle = { opt -> viewModel.selectSubtitleTrack(opt); resetControls() },
                onDisableSubtitles = { viewModel.disableSubtitles(); resetControls() },
                onClose = { showTracks = false; resetControls() },
            )
        }

        if (state.error != null) {
            ErrorBanner(message = state.error!!)
        }
    }
}

/**
 * Pauses playback when the activity goes to ON_PAUSE (display-off, app backgrounded)
 * and resumes when ON_RESUME fires. Without this, ExoPlayer keeps decoding to a dead
 * surface and the Plex transcode session times out — leading to a source error on wake.
 */
@Composable
private fun PlaybackLifecycleHandler(viewModel: PlayerViewModel) {
    val owner = androidx.lifecycle.compose.LocalLifecycleOwner.current
    DisposableEffect(owner) {
        val observer = androidx.lifecycle.LifecycleEventObserver { _, event ->
            when (event) {
                androidx.lifecycle.Lifecycle.Event.ON_PAUSE  -> viewModel.onAppPaused()
                androidx.lifecycle.Lifecycle.Event.ON_RESUME -> viewModel.onAppResumed()
                else -> Unit
            }
        }
        owner.lifecycle.addObserver(observer)
        onDispose { owner.lifecycle.removeObserver(observer) }
    }
}

/** Hides system bars while the player is on screen; restores on dispose. */
@Composable
private fun ImmersiveMode() {
    val view = LocalView.current
    DisposableEffect(view) {
        val window = (view.context as? android.app.Activity)?.window ?: return@DisposableEffect onDispose {}
        val controller = WindowCompat.getInsetsController(window, view)
        val previousBehavior = controller.systemBarsBehavior
        controller.systemBarsBehavior = WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.systemBars())
        // Defeat the TV idle screensaver while the player is mounted.
        window.addFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        onDispose {
            controller.systemBarsBehavior = previousBehavior
            controller.show(WindowInsetsCompat.Type.systemBars())
            window.clearFlags(android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
        }
    }
}

@Composable
private fun VideoSurface(viewModel: PlayerViewModel) {
    AndroidView(
        factory = { ctx ->
            androidx.media3.ui.PlayerView(ctx).apply {
                keepScreenOn = true
                useController = false
                resizeMode = androidx.media3.ui.AspectRatioFrameLayout.RESIZE_MODE_FIT
                player = viewModel.player
            }
        },
        modifier = Modifier.fillMaxSize(),
    )
}

@Composable
private fun AmbientGlow(ambient: Color) {
    Box(modifier = Modifier
        .fillMaxSize()
        .drawBehind {
            drawRect(
                brush = Brush.radialGradient(
                    colors = listOf(ambient.copy(alpha = 0.07f), Color.Transparent),
                    center = Offset(size.width / 2f, size.height / 2f),
                    radius = size.minDimension * 0.7f,
                )
            )
        }
    )
}

@Composable
private fun ControlsOverlay(
    state: PlayerUiState,
    ambient: Color,
    playRequester: FocusRequester,
    onClose: () -> Unit,
    onTogglePlay: () -> Unit,
    onSeekBy: (Long) -> Unit,
    onSeekTo: (Long) -> Unit,
    onToggleMute: () -> Unit,
    onOpenTracks: () -> Unit,
) {
    Box(modifier = Modifier
        .fillMaxSize()
        .drawBehind {
            drawRect(
                brush = Brush.verticalGradient(
                    colorStops = arrayOf(
                        0.00f to Color.Black.copy(alpha = 0.60f),
                        0.20f to Color.Transparent,
                        0.70f to Color.Transparent,
                        1.00f to Color.Black.copy(alpha = 0.85f),
                    ),
                )
            )
        }
    )

    Column(modifier = Modifier.fillMaxSize()) {
        TopBar(
            title = state.title,
            artist = state.artist,
            resolution = state.resolution,
            codec = state.codec,
            onClose = onClose,
        )
        Spacer(modifier = Modifier.weight(1f))
        BottomBar(
            state = state,
            ambient = ambient,
            playRequester = playRequester,
            onTogglePlay = onTogglePlay,
            onSeekBy = onSeekBy,
            onSeekTo = onSeekTo,
            onToggleMute = onToggleMute,
            onOpenTracks = onOpenTracks,
        )
    }
}

@Composable
private fun TopBar(
    title: String,
    artist: String?,
    resolution: String?,
    codec: String?,
    onClose: () -> Unit,
) {
    val context = LocalContext.current
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 64.dp, end = 64.dp, top = 40.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CircleButton(
                onClick = {
                    DebugLogger.log(context, "TopBar: UI Back/Close button clicked")
                    onClose()
                },
                contentDescription = "Close",
                size = 48.dp,
                icon = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
            )
            Column {
                Text(
                    text = title,
                    color = Color.White,
                    style = ButuType.HeadlineSm.copy(fontSize = 20.sp, fontWeight = FontWeight.Bold),
                )
                if (artist != null) {
                    Text(
                        text = artist,
                        color = ButuColors.OnSurfaceVariant,
                        style = ButuType.BodyMd.copy(fontSize = 14.sp),
                    )
                }
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            resolution?.let { TechChip(text = it, accent = true) }
            codec?.let { TechChip(text = it, accent = false) }
        }
    }
}

@Composable
private fun TechChip(text: String, accent: Boolean) {
    Text(
        text = text,
        color = if (accent) ButuColors.Primary else ButuColors.OnSurfaceVariant,
        style = ButuType.LabelMd.copy(fontSize = 12.sp),
        modifier = Modifier
            .background(
                color = if (accent) ButuColors.NeonAura.copy(alpha = 0.08f)
                        else ButuColors.SurfaceContainerHigh.copy(alpha = 0.8f),
                shape = CircleShape,
            )
            .border(
                width = 1.dp,
                color = if (accent) ButuColors.NeonAura.copy(alpha = 0.15f)
                        else ButuColors.OutlineVariant.copy(alpha = 0.30f),
                shape = CircleShape,
            )
            .padding(horizontal = 12.dp, vertical = 4.dp),
    )
}

@Composable
private fun BottomBar(
    state: PlayerUiState,
    ambient: Color,
    playRequester: FocusRequester,
    onTogglePlay: () -> Unit,
    onSeekBy: (Long) -> Unit,
    onSeekTo: (Long) -> Unit,
    onToggleMute: () -> Unit,
    onOpenTracks: () -> Unit,
) {
    Column(modifier = Modifier
        .fillMaxWidth()
        .padding(start = 64.dp, end = 64.dp, bottom = 48.dp)
    ) {
        val displayMs = state.scrubbingTargetMs ?: state.currentTimeMs
        SeekBar(
            currentMs = displayMs,
            durationMs = state.durationMs,
            bufferedMs = state.bufferedMs,
            ambient = ambient,
            onSeekBy = onSeekBy,
            onSeekTo = onSeekTo,
        )
        Spacer(modifier = Modifier.height(8.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Text(
                text = formatTime(displayMs / 1000L),
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 12.sp),
            )
            Text(
                text = formatTime(state.durationMs / 1000L),
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 12.sp),
            )
        }
        Spacer(modifier = Modifier.height(24.dp))
        TransportControls(
            isPlaying = state.isPlaying,
            isMuted = state.isMuted,
            bitrate = state.bitrate,
            ambient = ambient,
            playRequester = playRequester,
            hasTracks = state.audioTracks.isNotEmpty() || state.subtitleTracks.isNotEmpty(),
            onTogglePlay = onTogglePlay,
            onRewind = { onSeekBy(-SEEK_STEP_MS) },
            onForward = { onSeekBy(SEEK_STEP_MS) },
            onToggleMute = onToggleMute,
            onOpenTracks = onOpenTracks,
        )
    }
}

@Composable
private fun SeekBar(
    currentMs: Long,
    durationMs: Long,
    bufferedMs: Long,
    ambient: Color,
    onSeekBy: (Long) -> Unit,
    @Suppress("UNUSED_PARAMETER") onSeekTo: (Long) -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val progress = if (durationMs > 0) currentMs.toFloat() / durationMs else 0f
    val bufferedRatio = if (durationMs > 0) bufferedMs.toFloat() / durationMs else 0f

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(if (focused) 8.dp else 6.dp)
            .focusable(interactionSource = source)
            .onPreviewKeyEvent { event ->
                if (event.type != KeyEventType.KeyDown) return@onPreviewKeyEvent false
                when (event.key) {
                    Key.DirectionLeft  -> { onSeekBy(-SEEK_STEP_MS); true }
                    Key.DirectionRight -> { onSeekBy(SEEK_STEP_MS); true }
                    else -> false
                }
            }
            .background(
                color = ButuColors.NeonAura.copy(alpha = 0.08f),
                shape = CircleShape,
            )
            .border(
                width = 1.dp,
                color = if (focused) ButuColors.NeonAura.copy(alpha = 0.55f)
                        else ButuColors.NeonAura.copy(alpha = 0.12f),
                shape = CircleShape,
            )
            .then(
                if (focused) Modifier.shadow(
                    elevation = 8.dp,
                    shape = CircleShape,
                    ambientColor = ButuColors.NeonAura,
                    spotColor = ButuColors.NeonAura,
                    clip = false,
                ) else Modifier
            ),
    ) {
        // Buffered fill
        Box(modifier = Modifier
            .fillMaxWidth(bufferedRatio.coerceIn(0f, 1f))
            .fillMaxHeight()
            .background(
                color = ButuColors.NeonAura.copy(alpha = 0.15f),
                shape = CircleShape,
            )
        )
        // Played fill
        Box(modifier = Modifier
            .fillMaxWidth(progress.coerceIn(0f, 1f))
            .fillMaxHeight()
            .background(
                brush = Brush.horizontalGradient(listOf(ambient, ButuColors.NeonAura)),
                shape = CircleShape,
            )
        )
    }
}

@Composable
private fun TransportControls(
    isPlaying: Boolean,
    isMuted: Boolean,
    bitrate: String?,
    ambient: Color,
    playRequester: FocusRequester,
    hasTracks: Boolean,
    onTogglePlay: () -> Unit,
    onRewind: () -> Unit,
    onForward: () -> Unit,
    onToggleMute: () -> Unit,
    onOpenTracks: () -> Unit,
) {
    // Box (not a SpaceBetween Row) so the transport group sits DEAD CENTRE regardless of how
    // wide the side groups are. With SpaceBetween, the heavier right group (bitrate + CC +
    // fullscreen) shoved play/rewind/forward off-centre — worse once the CC button was added.
    Box(modifier = Modifier.fillMaxWidth()) {
        // Left — mute
        Row(
            modifier = Modifier.align(Alignment.CenterStart),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            CircleButton(
                onClick = onToggleMute,
                contentDescription = if (isMuted) "Unmute" else "Mute",
                size = 44.dp,
                icon = if (isMuted) Icons.AutoMirrored.Filled.VolumeOff
                       else Icons.AutoMirrored.Filled.VolumeUp,
            )
        }
        // Centre — rewind / play / forward, anchored to the true centre of the screen
        Row(
            modifier = Modifier.align(Alignment.Center),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            CircleButton(
                onClick = onRewind,
                contentDescription = "Rewind 10 seconds",
                size = 48.dp,
                icon = Icons.Filled.Replay10,
            )
            PlayPauseButton(
                isPlaying = isPlaying,
                ambient = ambient,
                onClick = onTogglePlay,
                modifier = Modifier.focusRequester(playRequester),
            )
            CircleButton(
                onClick = onForward,
                contentDescription = "Forward 10 seconds",
                size = 48.dp,
                icon = Icons.Filled.Forward10,
            )
        }
        // Right — bitrate + CC + fullscreen
        Row(
            modifier = Modifier.align(Alignment.CenterEnd),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            if (bitrate != null) {
                Text(
                    text = bitrate,
                    color = ButuColors.OnSurfaceVariant,
                    style = ButuType.LabelMd.copy(fontSize = 12.sp),
                )
            }
            if (hasTracks) {
                CircleButton(
                    onClick = onOpenTracks,
                    contentDescription = "Audio and subtitles",
                    size = 44.dp,
                    icon = Icons.Filled.ClosedCaption,
                )
            }
        }
    }
}

@Composable
private fun PlayPauseButton(
    isPlaying: Boolean,
    ambient: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.10f else 1f,
        animationSpec = tween(150),
        label = "playpause-scale",
    )
    Box(
        modifier = modifier
            .size(64.dp)
            .scale(scale)
            .shadow(
                elevation = if (focused) 22.dp else 12.dp,
                shape = CircleShape,
                ambientColor = ambient,
                spotColor = ambient,
                clip = false,
            )
            .background(
                brush = Brush.linearGradient(listOf(ambient, ButuColors.NeonAura)),
                shape = CircleShape,
            )
            .border(
                width = if (focused) 2.dp else 0.dp,
                color = if (focused) Color.White.copy(alpha = 0.85f) else Color.Transparent,
                shape = CircleShape,
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = if (isPlaying) Icons.Filled.Pause else Icons.Filled.PlayArrow,
            contentDescription = if (isPlaying) "Pause" else "Play",
            tint = ButuColors.OnPrimary,
            modifier = Modifier.size(22.dp),
        )
    }
}

@Composable
private fun CircleButton(
    onClick: () -> Unit,
    contentDescription: String,
    size: androidx.compose.ui.unit.Dp,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.08f else 1f,
        animationSpec = tween(120),
        label = "circle-btn-scale",
    )
    val tint = if (focused) ButuColors.Primary else ButuColors.OnSurfaceVariant
    val borderColor = if (focused) ButuColors.NeonAura.copy(alpha = 0.30f)
                      else ButuColors.OutlineVariant.copy(alpha = 0.30f)

    Box(
        modifier = Modifier
            .size(size)
            .scale(scale)
            .background(
                color = ButuColors.SurfaceContainer.copy(alpha = 0.6f),
                shape = CircleShape,
            )
            .border(width = 1.dp, color = borderColor, shape = CircleShape)
            .clickable(interactionSource = source, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(size * 0.42f),
        )
    }
}

/**
 * Compact pill shown when the playhead enters an intro or credits marker. Auto-focused
 * so the user can OK to skip without first navigating focus into the player.
 */
@Composable
private fun SkipMarkerButton(
    marker: dev.butu.domain.Marker,
    ambient: Color,
    onSkip: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val requester = remember { FocusRequester() }
    LaunchedEffect(marker.startMs, marker.type) {
        for (i in 1..10) {
            if (focused) break
            runCatching { requester.requestFocus() }
            kotlinx.coroutines.delay(100)
        }
    }
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.06f else 1f,
        animationSpec = tween(150),
        label = "skip-scale",
    )
    val label = if (marker.type == dev.butu.domain.MarkerType.Intro) "Skip Intro" else "Skip Credits"

    Row(
        modifier = modifier
            .scale(scale)
            .focusRequester(requester)
            .background(
                color = if (focused) ambient.copy(alpha = 0.92f) else Color(0xEE0E111B),
                shape = RoundedCornerShape(999.dp),
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) Color.White.copy(alpha = 0.85f) else ambient.copy(alpha = 0.40f),
                shape = RoundedCornerShape(999.dp),
            )
            // clickable already provides the focus target + OK handling; a separate
            // focusable would swallow the OK press (see TrackRowItem).
            .clickable(interactionSource = source, indication = null, onClick = onSkip)
            .padding(horizontal = 22.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Forward10,
            contentDescription = null,
            tint = if (focused) ButuColors.OnPrimary else Color.White,
            modifier = Modifier.size(16.dp),
        )
        Text(
            text = label,
            color = if (focused) ButuColors.OnPrimary else Color.White,
            style = ButuType.HeadlineSm.copy(fontSize = 14.sp, fontWeight = FontWeight.Bold),
        )
    }
}

/**
 * Bottom-right "Up Next" overlay shown when the playhead enters the credits marker
 * (or the last 30s if no marker is available). Auto-focuses the Play Now button so the
 * user can confirm with OK or wait for the autoplay trigger (`Player.STATE_ENDED`).
 */
@Composable
private fun UpNextCard(
    next: dev.butu.domain.Episode,
    ambient: Color,
    onPlayNow: () -> Unit,
    onDismiss: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val playRequester = remember { FocusRequester() }
    LaunchedEffect(next.id) {
        repeat(4) {
            runCatching { playRequester.requestFocus() }
            kotlinx.coroutines.delay(100)
        }
    }

    Column(
        modifier = modifier
            .widthIn(min = 320.dp, max = 380.dp)
            .background(Color(0xEE0E111B), RoundedCornerShape(20.dp))
            .border(1.dp, ambient.copy(alpha = 0.30f), RoundedCornerShape(20.dp))
            .padding(20.dp),
    ) {
        Text(
            text = "UP NEXT",
            color = ambient,
            style = ButuType.LabelMd.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(modifier = Modifier.height(8.dp))
        Text(
            text = "S${next.season} · E${next.episode}",
            color = ButuColors.OnSurfaceVariant,
            style = ButuType.LabelMd.copy(fontSize = 12.sp),
        )
        Spacer(modifier = Modifier.height(4.dp))
        Text(
            text = next.title,
            color = Color.White,
            style = ButuType.HeadlineSm.copy(fontSize = 16.sp, fontWeight = FontWeight.Bold),
            maxLines = 2,
        )
        if (!next.description.isNullOrBlank()) {
            Spacer(modifier = Modifier.height(6.dp))
            Text(
                text = next.description,
                color = ButuColors.OnSurface.copy(alpha = 0.55f),
                style = ButuType.BodyMd.copy(fontSize = 12.sp),
                maxLines = 2,
            )
        }
        Spacer(modifier = Modifier.height(16.dp))
        Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
            UpNextButton(
                label = "Play Now",
                primary = true,
                ambient = ambient,
                onClick = onPlayNow,
                modifier = Modifier.focusRequester(playRequester),
            )
            UpNextButton(
                label = "Cancel",
                primary = false,
                ambient = ambient,
                onClick = onDismiss,
            )
        }
    }
}

@Composable
private fun UpNextButton(
    label: String,
    primary: Boolean,
    ambient: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.05f else 1f,
        animationSpec = tween(150),
        label = "upnext-btn-scale",
    )
    Box(
        modifier = modifier
            .scale(scale)
            .background(
                color = when {
                    focused && primary -> ambient.copy(alpha = 0.92f)
                    focused            -> Color.White.copy(alpha = 0.18f)
                    primary            -> ambient.copy(alpha = 0.65f)
                    else               -> Color.White.copy(alpha = 0.08f)
                },
                shape = RoundedCornerShape(14.dp),
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) Color.White.copy(alpha = 0.85f)
                        else if (primary) ambient.copy(alpha = 0.40f)
                        else Color.White.copy(alpha = 0.12f),
                shape = RoundedCornerShape(14.dp),
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .padding(horizontal = 18.dp, vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (primary) ButuColors.OnPrimary else Color.White,
            style = ButuType.HeadlineSm.copy(fontSize = 13.sp, fontWeight = FontWeight.Bold),
        )
    }
}

/**
 * Right-anchored panel listing audio + subtitle tracks. The first focusable column
 * is auto-focused when the panel opens; D-pad Left/Right walks between columns,
 * Up/Down walks within a column.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
private fun TracksPanel(
    audio: List<TrackOption>,
    subtitles: List<TrackOption>,
    subtitlesDisabled: Boolean,
    ambient: Color,
    onSelectAudio: (TrackOption) -> Unit,
    onSelectSubtitle: (TrackOption) -> Unit,
    onDisableSubtitles: () -> Unit,
    onClose: () -> Unit,
) {
    val audioFocus = remember { FocusRequester() }
    val subtitleFocus = remember { FocusRequester() }

    // Land focus on the currently-selected track (falling back to the first row), not
    // always the first one — so reopening the menu highlights e.g. the French track the
    // user already picked. `audioFocusId` is non-null only when there are audio tracks.
    val audioFocusId = (audio.firstOrNull { it.isSelected } ?: audio.firstOrNull())?.id
    val selectedSubId = subtitles.firstOrNull { it.isSelected }?.id

    LaunchedEffect(audio.size, subtitles.size) {
        repeat(5) {
            runCatching {
                if (audio.isNotEmpty()) audioFocus.requestFocus()
                else subtitleFocus.requestFocus()
            }
            kotlinx.coroutines.delay(100)
        }
    }

    Box(modifier = Modifier
        .fillMaxSize()
        .background(Color.Black.copy(alpha = 0.55f))
        .clickable(
            interactionSource = remember { MutableInteractionSource() },
            indication = null,
            onClick = onClose,
        ),
    ) {
        Row(
            modifier = Modifier
                .align(Alignment.CenterEnd)
                // Trap D-pad focus inside the panel. At the top/bottom of a column the 2D
                // focus search would otherwise escape to the player controls behind the
                // overlay while the menu is still open — and there's no way back in. Cancel
                // any focus move that would leave the panel so it stays put (the menu is
                // dismissed with Back / tapping the scrim, not by navigating out).
                .focusProperties { exit = { FocusRequester.Cancel } }
                .focusGroup()
                .fillMaxHeight()
                .widthIn(max = 720.dp)
                .padding(end = 64.dp, top = 64.dp, bottom = 64.dp)
                .background(Color(0xF0080A12), RoundedCornerShape(24.dp))
                .border(1.dp, ambient.copy(alpha = 0.20f), RoundedCornerShape(24.dp))
                .padding(28.dp),
            horizontalArrangement = Arrangement.spacedBy(28.dp),
        ) {
            TrackColumn(
                title = "AUDIO",
                ambient = ambient,
                // Only redirect column-enter to a row that actually holds the requester.
                enterFocus = audioFocus.takeIf { audio.isNotEmpty() },
                rows = audio.map { opt ->
                    TrackRow(
                        label = opt.label,
                        selected = opt.isSelected,
                        focusRequester = if (opt.id == audioFocusId) audioFocus else null,
                        onSelect = { onSelectAudio(opt) },
                    )
                },
                emptyHint = "No audio tracks",
                modifier = Modifier.weight(1f),
            )
            TrackColumn(
                title = "SUBTITLES",
                ambient = ambient,
                // The "Off" row always exists, so subtitleFocus is always attached here.
                enterFocus = subtitleFocus,
                rows = buildList {
                    add(TrackRow(
                        label = "Off",
                        selected = subtitlesDisabled,
                        // Falls back to "Off" when subtitles are disabled or nothing is selected.
                        focusRequester = if (subtitlesDisabled || selectedSubId == null) subtitleFocus else null,
                        onSelect = onDisableSubtitles,
                    ))
                    subtitles.forEach { opt ->
                        add(TrackRow(
                            label = opt.label,
                            selected = opt.isSelected,
                            focusRequester = if (!subtitlesDisabled && opt.id == selectedSubId) subtitleFocus else null,
                            onSelect = { onSelectSubtitle(opt) },
                        ))
                    }
                },
                emptyHint = "No subtitles",
                modifier = Modifier.weight(1f),
            )
        }
    }
}

private data class TrackRow(
    val label: String,
    val selected: Boolean,
    val focusRequester: FocusRequester?,
    val onSelect: () -> Unit,
)

@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
private fun TrackColumn(
    title: String,
    ambient: Color,
    rows: List<TrackRow>,
    emptyHint: String,
    modifier: Modifier = Modifier,
    enterFocus: FocusRequester? = null,
) {
    Column(
        modifier = modifier
            .fillMaxHeight()
            // Entering this column (D-pad Left/Right) lands on its selected row rather
            // than the nearest one. Rows here aren't virtualized, so the target is always
            // composed — `enterFocus` is only passed when a row actually holds it.
            .then(
                if (enterFocus != null)
                    Modifier
                        .focusProperties { enter = { enterFocus } }
                        .focusGroup()
                else Modifier
            )
            .verticalScroll(rememberScrollState()),
    ) {
        Text(
            text = title,
            color = ambient,
            style = ButuType.LabelMd.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold),
        )
        Spacer(Modifier.height(16.dp))
        if (rows.isEmpty()) {
            Text(
                text = emptyHint,
                color = ButuColors.OnSurface.copy(alpha = 0.40f),
                style = ButuType.BodyMd.copy(fontSize = 13.sp),
            )
        } else {
            rows.forEachIndexed { idx, row ->
                if (idx > 0) Spacer(Modifier.height(8.dp))
                TrackRowItem(row = row, ambient = ambient)
            }
        }
    }
}

@Composable
private fun TrackRowItem(row: TrackRow, ambient: Color) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()

    val baseModifier = Modifier
        .fillMaxWidth()
        .then(if (row.focusRequester != null) Modifier.focusRequester(row.focusRequester) else Modifier)
        .background(
            color = when {
                focused        -> ambient.copy(alpha = 0.20f)
                row.selected   -> ambient.copy(alpha = 0.10f)
                else           -> Color.White.copy(alpha = 0.04f)
            },
            shape = RoundedCornerShape(12.dp),
        )
        .border(
            width = if (focused) 2.dp else 1.dp,
            color = when {
                focused      -> ambient.copy(alpha = 0.85f)
                row.selected -> ambient.copy(alpha = 0.40f)
                else         -> Color.White.copy(alpha = 0.08f)
            },
            shape = RoundedCornerShape(12.dp),
        )
        // `clickable` is itself focusable and is what turns a D-pad OK press into onClick.
        // A separate `.focusable()` here would steal focus into a node that has no click
        // handler, so OK on a highlighted row did nothing — that was the bug.
        .clickable(interactionSource = source, indication = null, onClick = row.onSelect)
        .padding(horizontal = 16.dp, vertical = 12.dp)

    Row(
        modifier = baseModifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        if (row.selected) {
            Icon(
                imageVector = Icons.Filled.Check,
                contentDescription = null,
                tint = ambient,
                modifier = Modifier.size(16.dp),
            )
        } else {
            Spacer(Modifier.size(16.dp))
        }
        Text(
            text = row.label,
            color = if (row.selected || focused) Color.White else ButuColors.OnSurface.copy(alpha = 0.75f),
            style = ButuType.BodyMd.copy(
                fontSize = 14.sp,
                fontWeight = if (row.selected) FontWeight.Bold else FontWeight.Medium,
            ),
        )
    }
}

@Composable
private fun ErrorBanner(message: String) {
    Box(modifier = Modifier
        .fillMaxSize()
        .padding(40.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = "⚠ $message",
            color = Color(0xFFFF6B6B),
            style = ButuType.HeadlineMd,
        )
    }
}

private fun formatTime(seconds: Long): String {
    if (seconds <= 0) return "0:00"
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

private fun parseHexColorOr(hex: String?, fallback: Color): Color {
    if (hex.isNullOrBlank()) return fallback
    return runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrElse { fallback }
}
