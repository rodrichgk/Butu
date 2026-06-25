package dev.butu.ui.components

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.animateScrollBy
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.itemsIndexed
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowRight
import androidx.compose.material3.Icon
import androidx.compose.foundation.gestures.LocalBringIntoViewSpec
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.derivedStateOf
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.scale
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import dev.butu.domain.MediaItem
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuType
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

private const val STAGGER_DELAY_MS = 40L

/**
 * Horizontal content rail. Mirrors src/components/MediaStage.tsx.
 *
 * Performance:
 *  - `LazyRow` virtualizes off-screen cards (the React version mounts every card
 *    in the row at once; this only composes ~5–7 visible cards on a 4K screen).
 *  - Stagger entry runs **once per row mount**, not per item-into-viewport, so
 *    scrolling back doesn't replay animations.
 *  - D-pad focus handling is automatic — `LazyRow` auto-scrolls focused items into
 *    view via the default `Modifier.focusable` integration.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class, androidx.compose.foundation.ExperimentalFoundationApi::class)
@Composable
fun MediaStage(
    title: String,
    items: List<MediaItem>,
    onSelect: (MediaItem) -> Unit,
    modifier: Modifier = Modifier,
    metaLabel: String? = null,
    /** Force every card to the same poster geometry — for mixed rows like Continue Watching. */
    uniformPoster: Boolean = false,
) {
    val state = rememberLazyListState()
    val scope = rememberCoroutineScope()
    val firstItemFocusRequester = remember { FocusRequester() }

    // Item 0 lives inside the LazyRow, which disposes it once it scrolls off-screen.
    // A raw `enter = { firstItemFocusRequester }` then points at an unattached node and
    // crashes ("FocusRequester is not initialized") on the next D-pad focus search —
    // e.g. after the Continue Watching row appears post-playback. Only redirect focus to
    // item 0 while it's actually placed; otherwise let the default focus search pick the
    // nearest visible card.
    val firstItemPlaced by remember {
        derivedStateOf { state.layoutInfo.visibleItemsInfo.any { it.index == 0 } }
    }
    val firstItemTarget = if (firstItemPlaced) firstItemFocusRequester else FocusRequester.Default
    val pivotSpec = remember { PivotBringIntoViewSpec() }

    // Stagger entry — counter advances from 0 → items.size, one tick every 40ms.
    // Each card whose index < counter is visible. Re-mount of off-screen items
    // sees the counter already saturated, so they snap in without re-animating.
    var visibleCount by remember(items.firstOrNull()?.id) { mutableIntStateOf(0) }
    LaunchedEffect(items.firstOrNull()?.id) {
        items.indices.forEach {
            visibleCount = it + 1
            delay(STAGGER_DELAY_MS)
        }
    }

    Column(modifier = modifier.padding(bottom = 64.dp)) {
        StageHeader(
            title = title,
            metaLabel = metaLabel,
            onScrollLeft = {
                scope.launch {
                    val amount = (state.layoutInfo.viewportEndOffset
                        - state.layoutInfo.viewportStartOffset) * 0.6f
                    state.animateScrollBy(-amount)
                }
            },
            onScrollRight = {
                scope.launch {
                    val amount = (state.layoutInfo.viewportEndOffset
                        - state.layoutInfo.viewportStartOffset) * 0.6f
                    state.animateScrollBy(amount)
                }
            },
            scrollLeftModifier = Modifier.focusProperties { down = firstItemTarget },
            scrollRightModifier = Modifier.focusProperties { down = firstItemTarget },
        )

        // Pivot scroll: the focused card always glides to the same spot, so D-pad navigation
        // is smooth and consistent instead of the default minimal-scroll jump.
        CompositionLocalProvider(LocalBringIntoViewSpec provides pivotSpec) {
            LazyRow(
                state = state,
                contentPadding = PaddingValues(horizontal = 80.dp, vertical = 32.dp),
                horizontalArrangement = Arrangement.spacedBy(20.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .focusProperties {
                        // Evaluated lazily at focus-search time, so it always reflects whether
                        // item 0 is currently placed (see firstItemPlaced above).
                        enter = { if (firstItemPlaced) firstItemFocusRequester else FocusRequester.Default }
                    },
            ) {
                itemsIndexed(
                    items = items,
                    key = { _, it -> it.id },
                    contentType = { _, it -> it.type },
                ) { index, item ->
                    StaggeredCard(visible = index < visibleCount) {
                        MediaCard(
                            item = item,
                            onSelect = onSelect,
                            forcedGeometry = if (uniformPoster) UniformPosterGeometry else null,
                            modifier = if (index == 0) Modifier.focusRequester(firstItemFocusRequester) else Modifier
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StageHeader(
    title: String,
    metaLabel: String?,
    onScrollLeft: () -> Unit,
    onScrollRight: () -> Unit,
    scrollLeftModifier: Modifier = Modifier,
    scrollRightModifier: Modifier = Modifier,
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 80.dp),
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(
                text = title,
                style = ButuType.HeadlineLg.copy(fontSize = 28.sp),
                color = ButuColors.OnSurface,
            )
            if (metaLabel != null) {
                Text(
                    text = metaLabel,
                    style = ButuType.LabelMd.copy(fontSize = 12.sp),
                    color = ButuColors.OnSurfaceVariant,
                    modifier = Modifier.padding(top = 4.dp),
                )
            }
        }

        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ScrollChevron(
                icon = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
                contentDescription = "Scroll left",
                onClick = onScrollLeft,
                modifier = scrollLeftModifier,
            )
            ScrollChevron(
                icon = Icons.AutoMirrored.Filled.KeyboardArrowRight,
                contentDescription = "Scroll right",
                onClick = onScrollRight,
                modifier = scrollRightModifier,
            )
        }
    }
}

@Composable
private fun ScrollChevron(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    contentDescription: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()

    val scale by animateFloatAsState(
        targetValue = if (focused) 1.08f else 1f,
        animationSpec = tween(150),
        label = "chevron-scale",
    )
    val borderColor = if (focused) ButuColors.NeonGlow30 else ButuColors.OutlineVariant.copy(alpha = 0.40f)
    val tint = if (focused) ButuColors.Primary else ButuColors.OnSurfaceVariant

    Box(
        modifier = modifier
            .size(40.dp)
            .scale(scale)
            .background(
                color = ButuColors.SurfaceContainer.copy(alpha = 0.80f),
                shape = CircleShape,
            )
            .border(width = 1.dp, color = borderColor, shape = CircleShape)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            ),
        contentAlignment = Alignment.Center,
    ) {
        Icon(
            imageVector = icon,
            contentDescription = contentDescription,
            tint = tint,
            modifier = Modifier.size(16.dp),
        )
    }
}

/**
 * Plays the entry animation for a card based on `visible`.
 * Mirrors the framer `initial: { opacity: 0, x: 20 } → animate: { opacity: 1, x: 0 }`.
 */
@Composable
private fun StaggeredCard(
    visible: Boolean,
    content: @Composable () -> Unit,
) {
    val alpha by animateFloatAsState(
        targetValue = if (visible) 1f else 0f,
        animationSpec = tween(400),
        label = "stage-card-alpha",
    )
    val xOffset by animateDpAsState(
        targetValue = if (visible) 0.dp else 20.dp,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessLow,
        ),
        label = "stage-card-x",
    )
    Box(modifier = Modifier
        .alpha(alpha)
        .padding(start = xOffset)
    ) {
        content()
    }
}
