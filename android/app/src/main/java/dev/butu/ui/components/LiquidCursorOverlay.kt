package dev.butu.ui.components

import androidx.compose.animation.core.CubicBezierEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.graphics.drawscope.withTransform
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuType
import kotlin.math.hypot
import kotlin.math.max
import kotlin.math.min

@Immutable
data class CursorState(
    val x: Float = 0f,
    val y: Float = 0f,
    val vx: Float = 0f,
    val vy: Float = 0f,
    val snapped: Boolean = false,
    val targetId: String? = null,
)

// framer-motion: damping=28, stiffness=600, mass=0.5
// dampingRatio = 28 / (2 * sqrt(600 * 0.5)) ≈ 0.808
private val CursorSpring = spring<Float>(dampingRatio = 0.808f, stiffness = 600f)
private val DotEase = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)
private val RingEase = CubicBezierEasing(0.16f, 1f, 0.3f, 1f)

/**
 * Full-screen cursor overlay for the air-mouse controller.
 * Transparent to pointer events — never consumes input.
 * Only draws when [wsConnected] is true (controller paired via WebSocket).
 */
@Composable
fun LiquidCursorOverlay(
    cursorState: CursorState,
    wsConnected: Boolean,
    modifier: Modifier = Modifier,
) {
    val density = LocalDensity.current

    // Spring-follow position (framer-motion useSpring equivalent)
    val springX by animateFloatAsState(cursorState.x, CursorSpring, label = "cx")
    val springY by animateFloatAsState(cursorState.y, CursorSpring, label = "cy")

    // Dot: radius animates between 10dp (free) and 24dp (snapped)
    val dotRadiusPx by animateFloatAsState(
        targetValue = with(density) { if (cursorState.snapped) 24.dp.toPx() else 10.dp.toPx() },
        animationSpec = tween(200, easing = DotEase),
        label = "dotR",
    )
    // Ring: radius and combined alpha animate
    val ringRadiusPx by animateFloatAsState(
        targetValue = with(density) { if (cursorState.snapped) 40.dp.toPx() else 20.dp.toPx() },
        animationSpec = tween(300, easing = RingEase),
        label = "ringR",
    )
    // Combined ring alpha: snapped=(0.3*1.0=0.3), free=(0.12*0.5=0.06)
    val ringAlpha by animateFloatAsState(
        targetValue = if (cursorState.snapped) 0.30f else 0.06f,
        animationSpec = tween(300, easing = RingEase),
        label = "ringA",
    )

    // Stretch based on velocity (skipped when snapped — cursor locks to target)
    val speed = hypot(cursorState.vx, cursorState.vy)
    val scaleX = if (cursorState.snapped) 1f else min(1f + speed * 0.04f, 1.4f)
    val scaleY = if (cursorState.snapped) 1f else max(1f - speed * 0.015f, 0.7f)

    Box(modifier = modifier.fillMaxSize()) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            if (!wsConnected) return@Canvas

            val center = Offset(springX, springY)

            // Ambient glow (box-shadow approximation via radial gradient)
            val glowRadius = dotRadiusPx * if (cursorState.snapped) 5f else 3f
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        ButuColors.Primary.copy(alpha = if (cursorState.snapped) 0.35f else 0.20f),
                        Color.Transparent,
                    ),
                    center = center,
                    radius = glowRadius.coerceAtLeast(1f),
                ),
                radius = glowRadius.coerceAtLeast(1f),
                center = center,
            )

            // Dot fill (radial gradient, stretched by velocity)
            val dotBrush = if (cursorState.snapped) {
                Brush.radialGradient(
                    colorStops = arrayOf(
                        0.00f to ButuColors.Primary.copy(alpha = 0.95f),
                        0.50f to Color(0xFF00F1FE).copy(alpha = 0.60f),
                        1.00f to Color.Transparent,
                    ),
                    center = center,
                    radius = dotRadiusPx.coerceAtLeast(1f),
                )
            } else {
                Brush.radialGradient(
                    colorStops = arrayOf(
                        0.00f to ButuColors.Primary.copy(alpha = 0.90f),
                        0.60f to ButuColors.Primary.copy(alpha = 0.40f),
                        1.00f to Color.Transparent,
                    ),
                    center = center,
                    radius = dotRadiusPx.coerceAtLeast(1f),
                )
            }
            withTransform({ scale(scaleX, scaleY, pivot = center) }) {
                drawCircle(brush = dotBrush, radius = dotRadiusPx, center = center)
            }

            // Ring outline
            drawCircle(
                color = ButuColors.Primary.copy(alpha = ringAlpha),
                radius = ringRadiusPx.coerceAtLeast(1f),
                center = center,
                style = Stroke(width = 1.dp.toPx()),
            )
        }

        if (wsConnected) {
            WsIndicatorBadge(modifier = Modifier.align(Alignment.BottomEnd).padding(32.dp))
        }
    }
}

@Composable
private fun WsIndicatorBadge(modifier: Modifier = Modifier) {
    val infinite = rememberInfiniteTransition(label = "wsPulse")
    val pulseAlpha by infinite.animateFloat(
        initialValue = 0.4f,
        targetValue = 1.0f,
        animationSpec = infiniteRepeatable(
            animation = tween(1_000),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "wsPulseAlpha",
    )
    Row(
        modifier = modifier,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Canvas(modifier = Modifier.size(8.dp)) {
            drawCircle(color = ButuColors.Primary.copy(alpha = pulseAlpha))
        }
        Text(
            text = "AIR MOUSE",
            color = ButuColors.Primary.copy(alpha = 0.6f),
            style = ButuType.LabelMd,
            fontSize = 10.sp,
        )
    }
}
