package dev.butu.ui.components

import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.wrapContentHeight
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil3.compose.AsyncImage
import coil3.request.ImageRequest
import coil3.request.crossfade
import coil3.request.error
import coil3.request.placeholder
import androidx.tv.material3.Text
import dev.butu.domain.MediaItem
import dev.butu.domain.MediaType
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuShapes
import dev.butu.ui.theme.ButuType

/** Visual rhythm hint — see DESIGN.md "Mix sizes for visual rhythm". */
enum class MediaCardSize { Standard, DoubleWide, Featured }

/** Uniform poster geometry (width × 2:3) for mixed rows like Continue Watching, so movies and
 *  TV shows don't render at different sizes/aspect ratios. */
val UniformPosterGeometry: Pair<Dp, Float> = 168.dp to (2f / 3f)

/**
 * Universal media card — poster (2:3), album (1:1), or wide (16:9) depending on type.
 * Mirrors src/components/MediaCard.tsx.
 *
 * Performance:
 *  - `MediaItem` is `@Immutable` and the lambda is captured by `remember` upstream,
 *    so this composable skips recomposition when scrolled past in a LazyRow.
 *  - Focus state stays local (`MutableInteractionSource`) — no Zustand/StateFlow
 *    subscription per card, matching the React `memo` strategy.
 */
@Composable
fun MediaCard(
    item: MediaItem,
    onSelect: (MediaItem) -> Unit,
    modifier: Modifier = Modifier,
    @Suppress("UNUSED_PARAMETER") size: MediaCardSize = MediaCardSize.Standard,
    /** Overrides the per-type geometry so a mixed row (e.g. Continue Watching) stays uniform. */
    forcedGeometry: Pair<Dp, Float>? = null,
) {
    val (cardWidth, aspectRatio) = forcedGeometry ?: item.type.cardGeometry()

    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()

    // Critically-damped springs (dampingRatio 1 = no overshoot/shake). Springs are velocity-aware,
    // so an interrupted reveal continues smoothly from where it was instead of restarting over a
    // fixed duration — that restart was the old fast/slow/snap inconsistency.
    val overlayAlpha by animateFloatAsState(
        targetValue = if (focused) 1f else 0.40f,
        animationSpec = spring(dampingRatio = 1f, stiffness = 300f),
        label = "media-card-overlay",
    )
    val metadataAlpha by animateFloatAsState(
        targetValue = if (focused) 1f else 0f,
        animationSpec = spring(dampingRatio = 1f, stiffness = 300f),
        label = "media-card-metadata-alpha",
    )
    val metadataOffset by animateDpAsState(
        targetValue = if (focused) 0.dp else 6.dp,
        animationSpec = spring(dampingRatio = 1f, stiffness = 300f),
        label = "media-card-metadata-offset",
    )

    Box(
        modifier = modifier
            .width(cardWidth)
            .aspectRatio(aspectRatio)
            .clip(ButuShapes.CardLg)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
            ) { onSelect(item) }
    ) {
        MediaCardThumbnail(item = item)
        MediaCardScrim(alpha = overlayAlpha)
        MediaCardMetadata(
            item = item,
            modifier = Modifier
                .align(Alignment.BottomStart)
                .fillMaxWidth()
                .alpha(metadataAlpha),
            offsetY = metadataOffset,
        )
        // Focus outline — a clean line that fades in smoothly with the rest of the reveal.
        Box(
            modifier = Modifier
                .fillMaxSize()
                .alpha(metadataAlpha)
                .border(
                    width = 2.dp,
                    color = ButuColors.NeonAura,
                    shape = ButuShapes.CardLg,
                )
        )
    }
}

@Composable
private fun MediaCardThumbnail(item: MediaItem) {
    AsyncImage(
        model = ImageRequest.Builder(androidx.compose.ui.platform.LocalContext.current)
            .data(item.thumbnail)
            .crossfade(true)
            .placeholder(android.R.color.transparent)
            .error(android.R.color.darker_gray)
            .build(),
        contentDescription = item.title,
        contentScale = ContentScale.Crop,
        modifier = Modifier.fillMaxSize(),
    )
}

/** Bottom-anchored gradient — `linear-gradient(to top, rgba(0,0,0,.85) 0%, rgba(0,0,0,.3) 50%, transparent 100%)`. */
@Composable
private fun MediaCardScrim(alpha: Float) {
    Box(
        modifier = Modifier
            .fillMaxSize()
            .alpha(alpha)
            .drawBehind {
                drawRect(
                    brush = Brush.verticalGradient(
                        colorStops = arrayOf(
                            0.0f to Color.Transparent,
                            0.5f to Color.Black.copy(alpha = 0.30f),
                            1.0f to Color.Black.copy(alpha = 0.85f),
                        )
                    )
                )
            }
    )
}

@Composable
private fun MediaCardMetadata(
    item: MediaItem,
    modifier: Modifier,
    offsetY: Dp,
) {
    Box(
        modifier = modifier
            .padding(16.dp)
            .wrapContentHeight()
    ) {
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .padding(top = offsetY)
        ) {
            androidx.compose.foundation.layout.Column {
                Text(
                    text = item.title,
                    style = ButuType.HeadlineSm.copy(
                        fontSize = 14.4.sp,
                        fontWeight = FontWeight.Bold,
                    ),
                    color = Color.White,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                MetadataRow(item = item)
            }
        }
    }
}

@Composable
private fun MetadataRow(item: MediaItem) {
    val hasYear = item.year != null
    val hasCodec = item.codec != null
    val hasArtist = item.artist != null
    val hasEpisode = item.season != null && item.episode != null
    if (!hasYear && !hasCodec && !hasArtist && !hasEpisode) return

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(top = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = androidx.compose.foundation.layout.Arrangement.spacedBy(8.dp),
    ) {
        item.year?.let {
            Text(
                text = it.toString(),
                style = ButuType.LabelMd.copy(fontSize = 10.sp),
                color = ButuColors.OnSurfaceVariant,
            )
        }
        item.codec?.let { CodecBadge(it) }
        item.artist?.let {
            Text(
                text = it,
                style = ButuType.BodyMd.copy(fontSize = 11.sp),
                color = ButuColors.OnSurfaceVariant,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
            )
        }
        if (item.season != null && item.episode != null) {
            Text(
                text = "S${item.season}·E${item.episode}",
                style = ButuType.LabelMd.copy(fontSize = 10.sp),
                color = ButuColors.OnSurfaceVariant,
            )
        }
    }
}

/** Mirrors the inline CodecBadge component in MediaCard.tsx. */
@Composable
private fun CodecBadge(codec: String) {
    Text(
        text = codec,
        style = ButuType.LabelMd.copy(fontSize = 10.sp),
        color = ButuColors.Primary,
        modifier = Modifier
            .background(
                color = ButuColors.NeonGlow12.copy(alpha = 0.08f),
                shape = RoundedCornerShape(4.dp),
            )
            .border(
                width = 1.dp,
                color = ButuColors.NeonGlow12,
                shape = RoundedCornerShape(4.dp),
            )
            .padding(horizontal = 8.dp, vertical = 2.dp),
    )
}

/**
 * Card geometry per type — width × aspectRatio.
 * Mirrors `getCardClass` + `getCardWidth` in MediaCard.tsx.
 */
private fun MediaType.cardGeometry(): Pair<Dp, Float> = when (this) {
    MediaType.Movie, MediaType.Anime, MediaType.Manga -> 208.dp to (2f / 3f)   // w-52 + 2:3 poster
    MediaType.Music -> 208.dp to 1f                                            // w-52 + 1:1 album
    MediaType.Tv, MediaType.Web -> 320.dp to (16f / 9f)                        // w-80 + 16:9 wide
}
