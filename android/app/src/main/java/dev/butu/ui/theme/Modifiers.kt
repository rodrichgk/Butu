package dev.butu.ui.theme

import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.composed
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.Shape
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp

/**
 * Glassmorphism background.
 *
 * NOTE: True backdrop-blur (CSS `backdrop-filter: blur(40px)`) requires SDK 31+ and
 * `RenderEffect.createBlurEffect`. We layer a high-alpha tinted fill plus a 1px inner
 * "ghost border" per DESIGN.md — visually equivalent at TV viewing distance and runs
 * at 120Hz with zero composition cost.
 *
 * Mirrors `.glass` (rgba(42,48,62,0.92)) from src/index.css.
 */
fun Modifier.glass(
    shape: Shape = ButuShapes.Glass,
    fill: Color = ButuColors.Glass,
    ghostBorder: Boolean = true,
): Modifier = this
    .background(color = fill, shape = shape)
    .then(
        if (ghostBorder) Modifier.border(
            width = 1.dp,
            color = ButuColors.OutlineVariant.copy(alpha = 0.20f),
            shape = shape
        ) else Modifier
    )

/** `.glass-sm` variant — denser, used for sidebars and chrome. */
fun Modifier.glassSmall(shape: Shape = ButuShapes.Glass): Modifier =
    glass(shape = shape, fill = ButuColors.GlassSm)

/**
 * Neon Aura focus glow — DESIGN.md "Layering Principle".
 * On focus: scale 1.05x + 1px primary inner stroke + 40px ambient teal glow.
 * Use `Modifier.shadow(blur, ambient = primary)` since native shadows compose freely
 * with the rest of the modifier chain.
 */
@Composable
fun Modifier.neonFocus(
    interactionSource: MutableInteractionSource,
    shape: Shape = ButuShapes.CardLg,
    scaleOnFocus: Float = 1.05f,
    glowRadius: Dp = 40.dp,
): Modifier {
    val focused by interactionSource.collectIsFocusedAsState()
    val scale by animateFloatAsState(
        targetValue = if (focused) scaleOnFocus else 1f,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioLowBouncy,
            stiffness = Spring.StiffnessMediumLow
        ),
        label = "neon-scale"
    )
    return this
        .scale(scale)
        .shadow(
            elevation = if (focused) glowRadius else 0.dp,
            shape = shape,
            ambientColor = ButuColors.NeonAura,
            spotColor = ButuColors.NeonAura,
            clip = false,
        )
        .then(
            if (focused) Modifier.border(
                width = 1.dp,
                color = ButuColors.NeonGlow30,
                shape = shape,
            ) else Modifier
        )
}

/**
 * Sugar variant — emits a focus state via local interaction source.
 * Use when the parent doesn't already supply one.
 */
@Composable
fun Modifier.neonFocusable(
    shape: Shape = ButuShapes.CardLg,
    scaleOnFocus: Float = 1.05f,
): Modifier {
    val source = remember { MutableInteractionSource() }
    return this
        .neonFocus(source, shape, scaleOnFocus)
}

/**
 * Hero scrim — vertical gradient anchored at bottom.
 * Mirrors `.hero-gradient` in src/index.css. Apply ON TOP of the hero image.
 */
fun Modifier.heroScrim(): Modifier = drawBehind {
    drawRect(
        brush = Brush.verticalGradient(
            colorStops = arrayOf(
                0.00f to ButuColors.HeroFadeNone,
                0.40f to ButuColors.HeroFadeMid,
                0.75f to ButuColors.HeroFadeStrong,
                1.00f to ButuColors.HeroFadeFull,
            )
        )
    )
}

/** Side gradient (`.hero-gradient-side`) — left-anchored fade for hero metadata legibility. */
fun Modifier.heroSideScrim(): Modifier = drawBehind {
    drawRect(
        brush = Brush.horizontalGradient(
            colorStops = arrayOf(
                0.00f to ButuColors.HeroSideFull,
                0.30f to ButuColors.HeroSideStrong,
                0.55f to ButuColors.HeroSideMid,
                1.00f to ButuColors.HeroSideNone,
            )
        )
    )
}

/**
 * Wraps a child with a FocusRequester reporter — useful for the air-mouse magnetic
 * snapping pipeline; we'll publish bounds to a `CursorTargetRegistry` later.
 */
@Composable
fun Modifier.reportFocus(
    onFocusChanged: (focused: Boolean) -> Unit,
    requester: FocusRequester = remember { FocusRequester() },
): Modifier = this
    .focusRequester(requester)
    .onFocusChanged { onFocusChanged(it.isFocused) }
