package dev.butu.feature.detail

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedContentTransitionScope
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
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.blur
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import dev.butu.util.DebugLogger
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Text
import coil3.compose.AsyncImage
import dev.butu.domain.Episode
import dev.butu.domain.MediaItem
import dev.butu.domain.MediaType
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuType

@Composable
fun DetailScreen(
    onClose: () -> Unit,
    onPlay: (itemId: String, startMs: Long, episodeId: String?) -> Unit,
    viewModel: DetailViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val context = LocalContext.current
    LaunchedEffect(Unit) {
        DebugLogger.log(context, "DetailScreen: Mounted / Lifecycle started")
    }

    val item = state.item
    if (item == null) {
        DetailMissing(onClose = onClose)
        return
    }

    val accent = remember(item.ambientColor) {
        parseHexColorOr(item.ambientColor, ButuColors.NeonAura)
    }

    Box(modifier = Modifier
        .fillMaxSize()
        .background(Color.Black)
    ) {
        DetailBackdrop(item = item)

        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState()),
        ) {
            BackBar(onBack = onClose)
            DetailHero(
                state = state,
                accent = accent,
                onMainPlay = { resolveMainPlay(state, onPlay) },
                onStartOver = { resolveStartOver(state, onPlay) },
            )
            if (state.isEpisodic) {
                DetailEpisodes(
                    state = state,
                    accent = accent,
                    onSeasonChange = viewModel::setActiveSeason,
                    onEpisodePlay = { ep -> resolveEpisodePlay(state, ep, onPlay) },
                )
            }
            Spacer(Modifier.height(80.dp))
        }
    }
}

@Composable
private fun DetailMissing(onClose: () -> Unit) {
    val context = LocalContext.current
    Box(modifier = Modifier
        .fillMaxSize()
        .background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Text(
                text = "Item not found",
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.HeadlineMd,
            )
            Spacer(Modifier.height(16.dp))
            Box(modifier = Modifier
                .clickable(onClick = {
                    DebugLogger.log(context, "DetailMissing: Back clicked")
                    onClose()
                })
                .padding(horizontal = 24.dp, vertical = 12.dp)
                .background(ButuColors.SurfaceContainer, RoundedCornerShape(12.dp))
            ) {
                Text(
                    text = "Back",
                    color = ButuColors.OnSurface,
                    style = ButuType.LabelLg,
                )
            }
        }
    }
}

@Composable
private fun DetailBackdrop(item: MediaItem) {
    Box(modifier = Modifier.fillMaxSize()) {
        val backdropUrl = item.backdropUrl ?: item.thumbnail
        AsyncImage(
            model = backdropUrl,
            contentDescription = null,
            contentScale = ContentScale.Crop,
            alignment = Alignment.TopCenter,
            modifier = Modifier
                .fillMaxSize()
                .alpha(if (item.backdropUrl != null) 0.22f else 0.08f)
                .then(if (item.backdropUrl == null) Modifier.blur(24.dp).scale(1.1f) else Modifier),
        )
        Box(modifier = Modifier
            .fillMaxSize()
            .drawBehind {
                drawRect(
                    brush = Brush.verticalGradient(
                        colorStops = arrayOf(
                            0.00f to Color.Black.copy(alpha = 0.38f),
                            0.38f to Color.Black.copy(alpha = 0.72f),
                            1.00f to Color.Black.copy(alpha = 0.97f),
                        ),
                    )
                )
            }
        )
    }
}

@Composable
private fun BackBar(onBack: () -> Unit) {
    val context = LocalContext.current
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.06f else 1f,
        animationSpec = tween(150),
        label = "back-scale",
    )
    val tint = if (focused) ButuColors.NeonAura else ButuColors.OnSurface.copy(alpha = 0.55f)

    Row(
        modifier = Modifier
            .padding(start = 80.dp, top = 32.dp, bottom = 8.dp)
            .scale(scale)
            .background(
                color = if (focused) ButuColors.NeonAura.copy(alpha = 0.12f) else Color.Transparent,
                shape = RoundedCornerShape(999.dp),
            )
            .border(
                width = if (focused) 1.5.dp else 0.dp,
                color = if (focused) ButuColors.NeonAura.copy(alpha = 0.55f) else Color.Transparent,
                shape = RoundedCornerShape(999.dp),
            )
            .clickable(interactionSource = source, indication = null, onClick = {
                DebugLogger.log(context, "DetailScreen: BackBar Back button clicked")
                onBack()
            })
            .padding(horizontal = 14.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
            contentDescription = null,
            tint = tint,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = "Back",
            color = tint,
            style = ButuType.BodyMd.copy(fontSize = 14.sp),
        )
    }
}

@Composable
private fun DetailHero(
    state: DetailUiState,
    accent: Color,
    onMainPlay: () -> Unit,
    onStartOver: () -> Unit,
) {
    val item = state.item ?: return
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(start = 80.dp, end = 80.dp, top = 24.dp, bottom = 48.dp),
        horizontalArrangement = Arrangement.spacedBy(40.dp),
        verticalAlignment = Alignment.Top,
    ) {
        DetailPoster(item = item, accent = accent)
        DetailInfo(
            state = state,
            accent = accent,
            onMainPlay = onMainPlay,
            onStartOver = onStartOver,
        )
    }
}

@Composable
private fun DetailPoster(item: MediaItem, accent: Color) {
    Box(
        modifier = Modifier
            .width(200.dp)
            .aspectRatio(2f / 3f)
            .shadow(
                elevation = 32.dp,
                shape = RoundedCornerShape(20.dp),
                ambientColor = accent,
                spotColor = accent,
                clip = false,
            )
            .clip(RoundedCornerShape(20.dp))
    ) {
        AsyncImage(
            model = item.thumbnail,
            contentDescription = item.title,
            contentScale = ContentScale.Crop,
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun DetailInfo(
    state: DetailUiState,
    accent: Color,
    onMainPlay: () -> Unit,
    onStartOver: () -> Unit,
) {
    val item = state.item ?: return
    val playRequester = remember { FocusRequester() }
    LaunchedEffect(item.id) { playRequester.requestFocus() }

    Column(modifier = Modifier.padding(top = 8.dp)) {
        Text(
            text = item.title,
            color = Color.White,
            style = ButuType.DisplaySm.copy(
                fontWeight = FontWeight.Black,
                fontSize = 52.sp,
                lineHeight = 56.sp,
            ),
        )
        Spacer(Modifier.height(16.dp))

        DetailMetaRow(state = state, accent = accent)

        if (!item.description.isNullOrBlank()) {
            Spacer(Modifier.height(20.dp))
            Text(
                text = item.description,
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.BodyMd.copy(fontSize = 15.sp, lineHeight = 25.sp),
                modifier = Modifier.widthIn(max = 560.dp),
            )
        }

        if (item.resolution != null || item.codec != null || item.bitrate != null) {
            Spacer(Modifier.height(24.dp))
            DetailTechSpecs(item = item)
        }

        if (item.type != MediaType.Manga) {
            Spacer(Modifier.height(32.dp))
            DetailActions(
                state = state,
                accent = accent,
                onMainPlay = onMainPlay,
                onStartOver = onStartOver,
                playRequester = playRequester,
            )
        }

        if (state.watchProgress != null && !state.isEpisodic && (item.durationSeconds ?: 0) > 0) {
            Spacer(Modifier.height(20.dp))
            DetailProgress(
                progressSeconds = state.watchProgress.timeSeconds,
                durationSeconds = item.durationSeconds!!,
                accent = accent,
            )
        }
    }
}

@Composable
private fun DetailMetaRow(state: DetailUiState, accent: Color) {
    val item = state.item ?: return
    val seasons = state.seasons

    Row(
        modifier = Modifier.fillMaxWidth(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item.year?.let {
            Text(
                text = it.toString(),
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 14.sp),
            )
        }
        item.rating?.let {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                Icon(
                    imageVector = Icons.Filled.Star,
                    contentDescription = null,
                    tint = accent,
                    modifier = Modifier.size(14.dp),
                )
                Text(
                    text = "%.1f".format(it),
                    color = accent,
                    style = ButuType.LabelMd.copy(fontSize = 14.sp, fontWeight = FontWeight.Bold),
                )
            }
        }
        if (item.durationSeconds != null && !state.isEpisodic) {
            Text(
                text = formatDuration(item.durationSeconds),
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 14.sp),
            )
        }
        if (state.isEpisodic) {
            val label = when {
                state.episodesLoading -> "Loading episodes…"
                else -> "${seasons.size} Season${if (seasons.size > 1) "s" else ""} · ${state.episodes.size} Episodes"
            }
            Text(
                text = label,
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 14.sp),
            )
        }
        item.genre.take(3).forEach { GenreChip(it) }
    }
}

@Composable
private fun GenreChip(label: String) {
    Text(
        text = label,
        color = ButuColors.OnSurface.copy(alpha = 0.6f),
        style = ButuType.BodyMd.copy(fontSize = 12.sp),
        modifier = Modifier
            .background(ButuColors.NeonAura.copy(alpha = 0.06f), CircleShape)
            .border(1.dp, ButuColors.NeonAura.copy(alpha = 0.10f), CircleShape)
            .padding(horizontal = 10.dp, vertical = 4.dp),
    )
}

@Composable
private fun DetailTechSpecs(item: MediaItem) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        item.resolution?.let {
            Text(
                text = it,
                color = ButuColors.Primary,
                style = ButuType.LabelMd.copy(fontSize = 12.sp),
                modifier = Modifier
                    .background(ButuColors.NeonAura.copy(alpha = 0.07f), RoundedCornerShape(6.dp))
                    .border(1.dp, ButuColors.NeonAura.copy(alpha = 0.14f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
        item.codec?.let {
            Text(
                text = it,
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 12.sp),
                modifier = Modifier
                    .background(ButuColors.SurfaceContainer.copy(alpha = 0.7f), RoundedCornerShape(6.dp))
                    .border(1.dp, ButuColors.OutlineVariant.copy(alpha = 0.30f), RoundedCornerShape(6.dp))
                    .padding(horizontal = 10.dp, vertical = 4.dp),
            )
        }
        item.bitrate?.let {
            Text(
                text = it,
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 12.sp),
            )
        }
    }
}

@Composable
private fun DetailActions(
    state: DetailUiState,
    accent: Color,
    onMainPlay: () -> Unit,
    onStartOver: () -> Unit,
    playRequester: FocusRequester,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PlayButton(
            label = resumeLabel(state),
            accent = accent,
            onClick = onMainPlay,
            modifier = Modifier.focusRequester(playRequester),
        )
        if (state.watchProgress != null) {
            StartOverButton(onClick = onStartOver)
        }
    }
}

@Composable
private fun PlayButton(
    label: String,
    accent: Color,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.05f else 1f,
        animationSpec = tween(180),
        label = "play-scale",
    )

    Row(
        modifier = modifier
            .scale(scale)
            .shadow(
                elevation = if (focused) 18.dp else 4.dp,
                shape = RoundedCornerShape(20.dp),
                ambientColor = accent,
                spotColor = accent,
                clip = false,
            )
            .background(
                brush = Brush.linearGradient(listOf(accent, ButuColors.NeonAura)),
                shape = RoundedCornerShape(20.dp),
            )
            .border(
                width = if (focused) 2.dp else 0.dp,
                color = if (focused) Color.White.copy(alpha = 0.85f) else Color.Transparent,
                shape = RoundedCornerShape(20.dp),
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .padding(horizontal = 32.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.PlayArrow,
            contentDescription = null,
            tint = ButuColors.OnPrimary,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = label,
            color = ButuColors.OnPrimary,
            style = ButuType.HeadlineSm.copy(fontWeight = FontWeight.Bold, fontSize = 16.sp),
        )
    }
}

@Composable
private fun StartOverButton(onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.05f else 1f,
        animationSpec = tween(150),
        label = "start-over-scale",
    )

    Row(
        modifier = Modifier
            .scale(scale)
            .shadow(
                elevation = if (focused) 12.dp else 0.dp,
                shape = RoundedCornerShape(20.dp),
                ambientColor = ButuColors.NeonAura,
                spotColor = ButuColors.NeonAura,
                clip = false,
            )
            .background(
                color = if (focused) ButuColors.SurfaceContainerHigh.copy(alpha = 0.92f)
                        else ButuColors.SurfaceContainer.copy(alpha = 0.7f),
                shape = RoundedCornerShape(20.dp),
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) ButuColors.NeonAura.copy(alpha = 0.85f)
                        else ButuColors.OutlineVariant.copy(alpha = 0.40f),
                shape = RoundedCornerShape(20.dp),
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .padding(horizontal = 24.dp, vertical = 16.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Refresh,
            contentDescription = null,
            tint = if (focused) ButuColors.OnSurface else ButuColors.OnSurface.copy(alpha = 0.7f),
            modifier = Modifier.size(15.dp),
        )
        Text(
            text = "Start Over",
            color = if (focused) ButuColors.OnSurface else ButuColors.OnSurface.copy(alpha = 0.7f),
            style = ButuType.BodyMd.copy(fontSize = 14.sp),
        )
    }
}

@Composable
private fun DetailProgress(
    progressSeconds: Int,
    durationSeconds: Int,
    accent: Color,
) {
    val ratio = (progressSeconds.toFloat() / durationSeconds).coerceIn(0f, 1f)
    Column(modifier = Modifier.widthIn(max = 300.dp)) {
        Box(modifier = Modifier
            .fillMaxWidth()
            .height(2.dp)
            .background(Color.White.copy(alpha = 0.08f), RoundedCornerShape(1.dp))
        ) {
            Box(modifier = Modifier
                .fillMaxWidth(ratio)
                .height(2.dp)
                .background(accent, RoundedCornerShape(1.dp))
            )
        }
        Spacer(Modifier.height(4.dp))
        Text(
            text = "${formatTime(progressSeconds)} / ${formatDuration(durationSeconds)} watched",
            color = accent,
            style = ButuType.LabelMd.copy(fontSize = 12.sp),
        )
    }
}

@Composable
private fun DetailEpisodes(
    state: DetailUiState,
    accent: Color,
    onSeasonChange: (Int) -> Unit,
    onEpisodePlay: (Episode) -> Unit,
) {
    Column(modifier = Modifier
        .fillMaxWidth()
        .padding(horizontal = 80.dp, vertical = 8.dp)
    ) {
        Box(modifier = Modifier
            .fillMaxWidth()
            .height(1.dp)
            .background(ButuColors.NeonAura.copy(alpha = 0.06f))
        )
        Spacer(Modifier.height(32.dp))

        if (state.episodesLoading) {
            Text(
                text = "LOADING EPISODES…",
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 12.sp),
            )
            return@Column
        }

        SeasonTabs(
            seasons = state.seasons,
            activeSeason = state.activeSeason,
            accent = accent,
            onSelect = onSeasonChange,
        )
        Spacer(Modifier.height(28.dp))

        AnimatedContent(
            targetState = state.activeSeason,
            transitionSpec = {
                (slideInVertically(tween(220)) { 16 } + fadeIn(tween(220)))
                    .togetherWith(fadeOut(tween(220)))
            },
            label = "season-grid",
        ) { _ ->
            EpisodeGrid(
                episodes = state.episodesForActiveSeason(),
                accent = accent,
                progress = state.watchProgress,
                episodeProgress = state.episodeProgress,
                onEpisodePlay = onEpisodePlay,
            )
        }
    }
}

@Composable
private fun SeasonTabs(
    seasons: List<Int>,
    activeSeason: Int,
    accent: Color,
    onSelect: (Int) -> Unit,
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Text(
            text = "SEASON",
            color = ButuColors.OnSurfaceVariant,
            style = ButuType.LabelMd.copy(fontSize = 12.sp),
            modifier = Modifier.padding(end = 12.dp),
        )
        seasons.forEach { season ->
            SeasonTab(
                number = season,
                isActive = season == activeSeason,
                accent = accent,
                onClick = { onSelect(season) },
            )
        }
    }
}

@Composable
private fun SeasonTab(number: Int, isActive: Boolean, accent: Color, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = when {
            focused  -> 1.06f
            isActive -> 1.04f
            else     -> 1f
        },
        animationSpec = tween(150),
        label = "season-scale",
    )

    val shape = RoundedCornerShape(14.dp)
    Box(
        modifier = Modifier
            .size(48.dp)
            .scale(scale)
            .background(
                brush = when {
                    focused  -> Brush.linearGradient(listOf(accent.copy(alpha = 0.32f), ButuColors.NeonAura.copy(alpha = 0.22f)))
                    isActive -> Brush.linearGradient(listOf(accent.copy(alpha = 0.13f), ButuColors.NeonAura.copy(alpha = 0.10f)))
                    else     -> Brush.linearGradient(listOf(ButuColors.SurfaceContainer.copy(alpha = 0.5f), ButuColors.SurfaceContainer.copy(alpha = 0.5f)))
                },
                shape = shape,
            )
            .border(
                width = when {
                    focused  -> 2.dp
                    isActive -> 1.dp
                    else     -> 1.dp
                },
                color = when {
                    focused  -> accent
                    isActive -> accent.copy(alpha = 0.30f)
                    else     -> ButuColors.OutlineVariant.copy(alpha = 0.30f)
                },
                shape = shape,
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = number.toString(),
            color = when {
                focused  -> Color.White
                isActive -> accent
                else     -> ButuColors.OnSurface.copy(alpha = 0.4f)
            },
            style = ButuType.HeadlineSm.copy(fontSize = 14.sp, fontWeight = FontWeight.Bold),
        )
    }
}

@Composable
private fun EpisodeGrid(
    episodes: List<Episode>,
    accent: Color,
    progress: dev.butu.data.progress.WatchProgress?,
    episodeProgress: Map<String, dev.butu.data.progress.WatchProgress>,
    onEpisodePlay: (Episode) -> Unit,
) {
    val columnCount = computeColumnCount()
    val rows = episodes.chunked(columnCount)

    Column(modifier = Modifier.fillMaxWidth()) {
        rows.forEach { rowEps ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp),
            ) {
                rowEps.forEach { ep ->
                    Box(modifier = Modifier.weight(1f)) {
                        val epProg = episodeProgress[ep.id]
                        val legacyCurrent = progress?.season == ep.season && progress.episode == ep.episode
                        val seconds = epProg?.timeSeconds ?: (if (legacyCurrent) progress?.timeSeconds else null)
                        EpisodeCard(
                            episode = ep,
                            isCurrent = legacyCurrent,
                            currentProgressSeconds = seconds,
                            accent = accent,
                            onClick = { onEpisodePlay(ep) },
                        )
                    }
                }
                repeat(columnCount - rowEps.size) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
            Spacer(modifier = Modifier.height(16.dp))
        }
    }
}

@Composable
private fun computeColumnCount(): Int {
    val width = LocalConfiguration.current.screenWidthDp
    return ((width - 160) / 300).coerceAtLeast(1)
}

@Composable
private fun EpisodeCard(
    episode: Episode,
    isCurrent: Boolean,
    currentProgressSeconds: Int?,
    accent: Color,
    onClick: () -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (focused) 1.02f else 1f,
        animationSpec = tween(150),
        label = "episode-scale",
    )

    val bg = when {
        focused   -> ButuColors.SurfaceContainerHigh.copy(alpha = 0.75f)
        isCurrent -> accent.copy(alpha = 0.03f)
        else      -> ButuColors.SurfaceContainer.copy(alpha = 0.45f)
    }
    val borderColor = when {
        focused   -> ButuColors.NeonAura.copy(alpha = 0.14f)
        isCurrent -> accent.copy(alpha = 0.13f)
        else      -> ButuColors.OutlineVariant.copy(alpha = 0.22f)
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .scale(scale)
            .background(bg, RoundedCornerShape(14.dp))
            .border(1.dp, borderColor, RoundedCornerShape(14.dp))
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .padding(16.dp),
        verticalAlignment = Alignment.Top,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        EpisodeBadge(number = episode.episode, isCurrent = isCurrent, accent = accent)

        Column(modifier = Modifier.weight(1f)) {
            Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = episode.title,
                    color = ButuColors.OnSurface,
                    style = ButuType.HeadlineSm.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f, fill = false),
                )
                if (isCurrent) {
                    Text(
                        text = "WATCHING",
                        color = accent,
                        style = ButuType.LabelMd.copy(fontSize = 9.sp),
                        modifier = Modifier
                            .background(accent.copy(alpha = 0.10f), RoundedCornerShape(4.dp))
                            .padding(horizontal = 6.dp, vertical = 2.dp),
                    )
                }
            }
            Spacer(Modifier.height(2.dp))
            Text(
                text = formatDuration(episode.durationSeconds),
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 12.sp),
            )
            if (!episode.description.isNullOrBlank()) {
                Spacer(Modifier.height(4.dp))
                Text(
                    text = episode.description,
                    color = ButuColors.OnSurface.copy(alpha = 0.42f),
                    style = ButuType.BodyMd.copy(fontSize = 12.sp),
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                )
            }
            if (currentProgressSeconds != null) {
                Spacer(Modifier.height(8.dp))
                val ratio = (currentProgressSeconds.toFloat() / episode.durationSeconds).coerceIn(0f, 1f)
                Box(modifier = Modifier
                    .fillMaxWidth()
                    .height(2.dp)
                    .background(Color.White.copy(alpha = 0.08f), RoundedCornerShape(1.dp))
                ) {
                    Box(modifier = Modifier
                        .fillMaxWidth(ratio)
                        .height(2.dp)
                        .background(accent, RoundedCornerShape(1.dp))
                    )
                }
                Spacer(Modifier.height(2.dp))
                Text(
                    text = "${formatTime(currentProgressSeconds)} / ${formatDuration(episode.durationSeconds)}",
                    color = accent,
                    style = ButuType.LabelMd.copy(fontSize = 10.sp),
                )
            }
        }

        Icon(
            imageVector = Icons.Filled.PlayArrow,
            contentDescription = null,
            tint = ButuColors.OnSurface.copy(alpha = 0.28f),
            modifier = Modifier.size(14.dp).align(Alignment.CenterVertically),
        )
    }
}

@Composable
private fun EpisodeBadge(number: Int, isCurrent: Boolean, accent: Color) {
    Box(
        modifier = Modifier
            .size(44.dp)
            .background(
                color = if (isCurrent) accent.copy(alpha = 0.10f)
                        else ButuColors.SurfaceContainer.copy(alpha = 0.5f),
                shape = RoundedCornerShape(10.dp),
            )
            .border(
                width = 1.dp,
                color = if (isCurrent) accent.copy(alpha = 0.15f)
                        else ButuColors.OutlineVariant.copy(alpha = 0.30f),
                shape = RoundedCornerShape(10.dp),
            ),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = number.toString(),
            color = if (isCurrent) accent else ButuColors.OnSurface.copy(alpha = 0.38f),
            style = ButuType.LabelMd.copy(fontSize = 14.sp, fontWeight = FontWeight.Bold),
        )
    }
}

private fun resumeLabel(state: DetailUiState): String {
    val prog = state.watchProgress
    return when {
        prog != null && state.isEpisodic && prog.season != null && prog.episode != null ->
            "Continue · S${prog.season} E${prog.episode}  ${formatTime(prog.timeSeconds)}"
        prog != null -> "Resume · ${formatTime(prog.timeSeconds)}"
        state.isEpisodic -> "Play from S1 E1"
        else -> "Play"
    }
}

private fun resolveMainPlay(
    state: DetailUiState,
    onPlay: (itemId: String, startMs: Long, episodeId: String?) -> Unit,
) {
    val item = state.item ?: return
    val prog = state.watchProgress
    val firstEp = state.episodes.firstOrNull()

    when {
        prog != null && state.isEpisodic && prog.season != null && prog.episode != null -> {
            val ep = state.episodes.firstOrNull { it.season == prog.season && it.episode == prog.episode }
            if (ep != null) {
                val epProg = state.episodeProgress[ep.id]
                val isFinished = epProg != null && ep.durationSeconds > 0 && epProg.timeSeconds >= (ep.durationSeconds * 0.95f)
                if (isFinished) onPlay(item.id, 0L, ep.id)
                else onPlay(item.id, prog.timeSeconds * 1_000L, ep.id)
            }
            else onPlay(item.id, prog.timeSeconds * 1_000L, null)
        }
        prog != null -> {
            val isFinished = (item.durationSeconds ?: 0) > 0 && prog.timeSeconds >= (item.durationSeconds!! * 0.95f)
            if (isFinished) onPlay(item.id, 0L, null)
            else onPlay(item.id, prog.timeSeconds * 1_000L, null)
        }
        state.isEpisodic && firstEp != null -> onPlay(item.id, 0L, firstEp.id)
        else -> onPlay(item.id, 0L, null)
    }
}

private fun resolveStartOver(
    state: DetailUiState,
    onPlay: (itemId: String, startMs: Long, episodeId: String?) -> Unit,
) {
    val item = state.item ?: return
    val firstEp = state.episodes.firstOrNull()
    if (state.isEpisodic && firstEp != null) onPlay(item.id, 0L, firstEp.id)
    else onPlay(item.id, 0L, null)
}

private fun resolveEpisodePlay(
    state: DetailUiState,
    ep: Episode,
    onPlay: (itemId: String, startMs: Long, episodeId: String?) -> Unit,
) {
    val item = state.item ?: return
    val prog = state.watchProgress
    val epProg = state.episodeProgress[ep.id]
    
    val isFinished = epProg != null && ep.durationSeconds > 0 && epProg.timeSeconds >= (ep.durationSeconds * 0.95f)
    val isResume = !isFinished && prog?.season == ep.season && prog?.episode == ep.episode
    
    val startMs = if (isResume && prog != null) prog.timeSeconds * 1_000L else 0L
    onPlay(item.id, startMs, ep.id)
}

private fun formatDuration(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}

private fun formatTime(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    val s = seconds % 60
    return if (h > 0) "%d:%02d:%02d".format(h, m, s) else "%d:%02d".format(m, s)
}

private fun parseHexColorOr(hex: String?, fallback: Color): Color {
    if (hex.isNullOrBlank()) return fallback
    return runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrElse { fallback }
}
