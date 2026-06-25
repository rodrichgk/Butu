package dev.butu.ui.components

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.AnimatedVisibilityScope
import androidx.compose.animation.ExperimentalAnimationApi
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
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
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LocalLifecycleOwner
import androidx.lifecycle.repeatOnLifecycle
import androidx.tv.material3.Text
import coil3.SingletonImageLoader
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import dev.butu.domain.MediaItem
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuType
import dev.butu.ui.theme.heroScrim
import dev.butu.ui.theme.heroSideScrim
import kotlinx.coroutines.delay

private const val SLIDE_DURATION_MS = 8_000L

/**
 * Editorial hero carousel — full-bleed art with 8s auto-advance crossfade.
 * Mirrors src/components/HeroCarousel.tsx.
 *
 * Lifecycle:
 *  - Auto-advance is bound to `Lifecycle.State.RESUMED` via `repeatOnLifecycle`,
 *    so the timer pauses when the activity is backgrounded — matches the React
 *    `visibilitychange` listener.
 *  - Pre-warms all backdrops into Coil's disk cache on first mount.
 */
@Composable
fun HeroCarousel(
    items: List<MediaItem>,
    onSelect: (MediaItem) -> Unit,
    onPlay: (MediaItem) -> Unit,
    modifier: Modifier = Modifier,
) {
    if (items.isEmpty()) return

    var activeIdx by remember(items.firstOrNull()?.id) { mutableIntStateOf(0) }
    val current = items[activeIdx.coerceIn(0, items.lastIndex)]

    PrewarmBackdrops(items)
    AutoAdvance(itemCount = items.size) { activeIdx = (activeIdx + 1) % items.size }

    Box(modifier = modifier.fillMaxSize()) {
        HeroBackground(current = current)
        HeroMetadata(
            current = current,
            onPlay = onPlay,
            onMoreInfo = onSelect,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .padding(start = 80.dp, end = 48.dp, bottom = 64.dp)
                .widthIn(max = 768.dp),
        )
        SlideIndicators(
            count = items.size,
            activeIdx = activeIdx,
            onSelect = { activeIdx = it },
            modifier = Modifier
                .align(Alignment.BottomEnd)
                .padding(end = 80.dp, bottom = 32.dp),
        )
    }
}

@OptIn(ExperimentalAnimationApi::class)
@Composable
private fun HeroBackground(current: MediaItem) {
    AnimatedContent(
        targetState = current,
        transitionSpec = {
            (fadeIn(tween(450)) togetherWith fadeOut(tween(450)))
        },
        label = "hero-bg",
    ) { item ->
        Box(modifier = Modifier.fillMaxSize()) {
            AsyncImage(
                model = ImageRequest.Builder(LocalContext.current)
                    .data(item.backdropUrl ?: item.thumbnail)
                    .crossfade(false)
                    .build(),
                contentDescription = null,
                contentScale = ContentScale.Crop,
                alignment = Alignment.TopCenter,
                modifier = Modifier.fillMaxSize(),
            )
            Box(modifier = Modifier
                .fillMaxSize()
                .background(Color.Black.copy(alpha = 0.40f))
            )
            Box(modifier = Modifier.fillMaxSize().heroScrim())
            Box(modifier = Modifier.fillMaxSize().heroSideScrim())
            AmbientGlow(item.ambientColor)
        }
    }
}

/** Per-slide accent glow anchored at 18% from left, 82% from top. */
@Composable
private fun AmbientGlow(ambientColor: String?) {
    val color = remember(ambientColor) { parseHexColorOr(ambientColor, ButuColors.NeonAura) }
    Box(modifier = Modifier
        .fillMaxSize()
        .drawBehind {
            drawRect(
                brush = Brush.radialGradient(
                    colors = listOf(color.copy(alpha = 0.11f), Color.Transparent),
                    center = Offset(size.width * 0.18f, size.height * 0.82f),
                    radius = size.minDimension * 0.52f,
                )
            )
        }
    )
}

@OptIn(ExperimentalAnimationApi::class)
@Composable
private fun HeroMetadata(
    current: MediaItem,
    onPlay: (MediaItem) -> Unit,
    onMoreInfo: (MediaItem) -> Unit,
    modifier: Modifier,
) {
    AnimatedContent(
        targetState = current,
        transitionSpec = {
            (slideInVertically(tween(380)) { it / 4 } + fadeIn(tween(380)))
                .togetherWith(slideOutVertically(tween(380)) { -it / 8 } + fadeOut(tween(380)))
        },
        modifier = modifier,
        label = "hero-meta",
    ) { item ->
        Column {
            GenreRow(genres = item.genre.take(2))
            Spacer(Modifier.height(16.dp))

            Text(
                text = item.title,
                style = ButuType.DisplayLg.copy(
                    fontSize = 64.sp,
                    fontWeight = FontWeight.Black,
                    lineHeight = 64.sp,
                ),
                color = Color.White,
            )
            Spacer(Modifier.height(16.dp))

            MetadataLine(item = item)
            Spacer(Modifier.height(20.dp))

            item.description?.let {
                Text(
                    text = it,
                    style = ButuType.BodyLg,
                    color = ButuColors.OnSurfaceVariant,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.widthIn(max = 576.dp),
                )
                Spacer(Modifier.height(32.dp))
            }

            HeroActions(
                onPlay = { onPlay(item) },
                onMoreInfo = { onMoreInfo(item) },
            )
        }
    }
}

@Composable
private fun GenreRow(genres: List<String>) {
    if (genres.isEmpty()) return
    Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        genres.forEach { GenreChip(it) }
    }
}

@Composable
private fun GenreChip(label: String) {
    Text(
        text = label.uppercase(),
        style = ButuType.LabelMd.copy(fontSize = 11.sp),
        color = ButuColors.Primary,
        modifier = Modifier
            .background(
                color = ButuColors.NeonAura.copy(alpha = 0.10f),
                shape = CircleShape,
            )
            .border(
                width = 1.dp,
                color = ButuColors.NeonAura.copy(alpha = 0.15f),
                shape = CircleShape,
            )
            .padding(horizontal = 12.dp, vertical = 4.dp),
    )
}

@Composable
private fun MetadataLine(item: MediaItem) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        item.rating?.let { StarRating(it) }
        item.year?.let { TechMeta(it.toString()) }
        item.durationSeconds?.let { TechMeta(formatDuration(it)) }
        item.resolution?.let { ResolutionChip(it) }
    }
}

@Composable
private fun StarRating(rating: Float) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Star,
            contentDescription = null,
            tint = ButuColors.Primary,
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = "%.1f".format(rating),
            style = ButuType.LabelMd.copy(fontSize = 14.sp),
            color = ButuColors.Primary,
        )
    }
}

@Composable
private fun TechMeta(text: String) {
    Text(
        text = text,
        style = ButuType.LabelMd.copy(fontSize = 14.sp),
        color = ButuColors.OnSurfaceVariant,
    )
}

@Composable
private fun ResolutionChip(text: String) {
    Text(
        text = text,
        style = ButuType.LabelMd.copy(fontSize = 12.sp),
        color = ButuColors.Primary,
        modifier = Modifier
            .background(
                color = ButuColors.NeonAura.copy(alpha = 0.08f),
                shape = RoundedCornerShape(4.dp),
            )
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

@Composable
private fun HeroActions(onPlay: () -> Unit, onMoreInfo: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        PlayNowButton(onClick = onPlay)
        MoreInfoButton(onClick = onMoreInfo)
    }
}

@Composable
private fun PlayNowButton(onClick: () -> Unit) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    val scale by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (focused) 1.08f else 1f,
        animationSpec = tween(200),
        label = "play-scale",
    )

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        modifier = Modifier
            .scale(scale)
            .shadow(
                elevation = if (focused) 18.dp else 10.dp,
                shape = CircleShape,
                ambientColor = ButuColors.NeonAura,
                spotColor = ButuColors.NeonAura,
                clip = false,
            )
            .background(
                brush = Brush.linearGradient(
                    colors = listOf(ButuColors.NeonAura, ButuColors.PrimaryContainer),
                ),
                shape = CircleShape,
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) Color.White.copy(alpha = 0.85f) else Color.White.copy(alpha = 0.10f),
                shape = CircleShape,
            )
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .padding(horizontal = 32.dp, vertical = 14.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.PlayArrow,
            contentDescription = null,
            tint = ButuColors.OnPrimary,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = "Play Now",
            style = ButuType.HeadlineSm.copy(fontSize = 16.sp, fontWeight = FontWeight.Bold),
            color = ButuColors.OnPrimary,
        )
    }
}

@Composable
private fun MoreInfoButton(onClick: () -> Unit) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    val scale by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (focused) 1.08f else 1f,
        animationSpec = tween(150),
        label = "info-scale",
    )

    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
        modifier = Modifier
            .scale(scale)
            .shadow(
                elevation = if (focused) 14.dp else 0.dp,
                shape = CircleShape,
                ambientColor = ButuColors.NeonAura,
                spotColor = ButuColors.NeonAura,
                clip = false,
            )
            .background(
                color = if (focused) ButuColors.OnSurface.copy(alpha = 0.28f)
                        else ButuColors.OnSurface.copy(alpha = 0.11f),
                shape = CircleShape,
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) ButuColors.NeonAura.copy(alpha = 0.85f)
                        else ButuColors.OnSurface.copy(alpha = 0.14f),
                shape = CircleShape,
            )
            .clickable(interactionSource = interactionSource, indication = null, onClick = onClick)
            .padding(horizontal = 32.dp, vertical = 16.dp),
    ) {
        Icon(
            imageVector = Icons.Filled.Info,
            contentDescription = null,
            tint = ButuColors.OnSurface,
            modifier = Modifier.size(18.dp),
        )
        Text(
            text = "More Info",
            style = ButuType.HeadlineSm.copy(fontSize = 16.sp, fontWeight = FontWeight.Bold),
            color = ButuColors.OnSurface,
        )
    }
}

@Composable
private fun SlideIndicators(
    count: Int,
    activeIdx: Int,
    onSelect: (Int) -> Unit,
    modifier: Modifier,
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        repeat(count) { i ->
            val width by androidx.compose.animation.core.animateDpAsState(
                targetValue = if (i == activeIdx) 24.dp else 6.dp,
                animationSpec = tween(300),
                label = "indicator-width",
            )
            Box(
                modifier = Modifier
                    .width(width)
                    .height(6.dp)
                    .background(
                        color = if (i == activeIdx) ButuColors.NeonAura
                                else ButuColors.OnSurface.copy(alpha = 0.25f),
                        shape = RoundedCornerShape(3.dp),
                    )
                    .clickable { onSelect(i) }
            )
        }
    }
}

/**
 * Auto-advances `activeIdx` every 8s while RESUMED. Pauses on background
 * (mirrors the React `visibilitychange` listener).
 */
@Composable
private fun AutoAdvance(itemCount: Int, onTick: () -> Unit) {
    if (itemCount <= 1) return
    val lifecycleOwner = LocalLifecycleOwner.current
    LaunchedEffect(itemCount, lifecycleOwner) {
        lifecycleOwner.lifecycle.repeatOnLifecycle(Lifecycle.State.RESUMED) {
            while (true) {
                delay(SLIDE_DURATION_MS)
                onTick()
            }
        }
    }
}

/** Pushes all backdrop URLs through Coil into the disk cache once. */
@Composable
private fun PrewarmBackdrops(items: List<MediaItem>) {
    val context = LocalContext.current
    LaunchedEffect(items.firstOrNull()?.id) {
        val loader = SingletonImageLoader.get(context)
        items.forEach { item ->
            val url = item.backdropUrl ?: item.thumbnail
            if (url.isNotBlank()) {
                loader.enqueue(ImageRequest.Builder(context).data(url).build())
            }
        }
    }
}

private fun formatDuration(seconds: Int): String {
    val h = seconds / 3600
    val m = (seconds % 3600) / 60
    return if (h > 0) "${h}h ${m}m" else "${m}m"
}

private fun parseHexColorOr(hex: String?, fallback: Color): Color {
    if (hex.isNullOrBlank()) return fallback
    return runCatching { Color(android.graphics.Color.parseColor(hex)) }.getOrElse { fallback }
}
