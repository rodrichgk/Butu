package dev.butu.feature.splash

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.LinearEasing
import androidx.compose.animation.core.keyframes
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
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
import androidx.compose.foundation.layout.wrapContentSize
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuFonts
import dev.butu.ui.theme.ButuType
import kotlinx.coroutines.delay

private const val MIN_DURATION_MS = 2_400        // Wordmark animation runtime.
private const val MAX_DURATION_MS = 12_000       // Upper bound — never block the user forever.
private const val FINISH_HOLD_MS  = 350L         // Pause after bar hits 100% before exiting.

private val Letters = listOf("B", "U", "T", "U")

/**
 * Splash screen — wordmark reveal + progress bar.
 *
 * The progress bar is bound to actual app readiness:
 *   1. fills 0 → 80% over [MIN_DURATION_MS] (initial wordmark animation)
 *   2. holds at 80% until [isReady] flips to true
 *   3. jumps 80 → 100% over 300ms when ready, then waits [FINISH_HOLD_MS] and exits
 *
 * Capped at [MAX_DURATION_MS] so a stalled library load can't trap the user forever.
 */
@Composable
fun SplashScreen(
    onComplete: () -> Unit,
    isReady: Boolean = true,
) {
    val ready = rememberUpdatedState(isReady)
    val barProgress = remember { Animatable(0f) }

    LaunchedEffect(Unit) {
        val start = System.currentTimeMillis()
        // Stage 1: bar drives to 80% over the wordmark animation window.
        barProgress.animateTo(0.80f, tween(MIN_DURATION_MS - 200, easing = LinearEasing))
        // Stage 2: hold at 80% until either ready or we hit the hard cap.
        val maxDeadline = start + MAX_DURATION_MS
        while (!ready.value && System.currentTimeMillis() < maxDeadline) {
            delay(50)
        }
        // Stage 3: finish the bar and exit.
        barProgress.animateTo(1f, tween(300, easing = LinearEasing))
        delay(FINISH_HOLD_MS)
        onComplete()
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color(0xFF06080D)),
        contentAlignment = Alignment.Center,
    ) {
        AmbientGlow()
        SplashCenter()
        ProgressBar(
            progress = barProgress.value,
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 52.dp),
        )
        VersionTag(modifier = Modifier
            .align(Alignment.BottomCenter)
            .padding(bottom = 38.dp)
        )
    }
}

@Composable
private fun AmbientGlow() {
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(500)
        alpha.animateTo(1f, tween(2_000, easing = LinearEasing))
    }
    Box(modifier = Modifier
        .fillMaxSize()
        .alpha(alpha.value)
        .drawBehind {
            drawRect(
                brush = Brush.radialGradient(
                    colors = listOf(
                        ButuColors.NeonAura.copy(alpha = 0.07f),
                        Color.Transparent,
                    ),
                    center = Offset(size.width / 2f, size.height / 2f),
                    radius = (size.minDimension * 0.55f) / 2f * 1.5f,
                )
            )
        }
    )
}

@Composable
private fun SplashCenter() {
    Column(
        modifier = Modifier.wrapContentSize(),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.spacedBy(20.dp),
    ) {
        LeadingDot()
        Wordmark()
        Separator()
        Tagline()
    }
}

@Composable
private fun LeadingDot() {
    val scale = remember { Animatable(0f) }
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(150)
        scale.animateTo(
            targetValue = 1f,
            animationSpec = keyframes {
                durationMillis = 550
                0f at 0
                1.3f at 302
                1.0f at 550
            },
        )
    }
    LaunchedEffect(Unit) {
        delay(150)
        alpha.animateTo(
            targetValue = 0.65f,
            animationSpec = keyframes {
                durationMillis = 550
                0f at 0
                1f at 302
                0.65f at 550
            },
        )
    }
    Box(
        modifier = Modifier
            .size(5.dp)
            .scale(scale.value)
            .alpha(alpha.value)
            .shadow(
                elevation = 14.dp,
                shape = CircleShape,
                ambientColor = ButuColors.NeonAura,
                spotColor = ButuColors.NeonAura,
                clip = false,
            )
            .background(ButuColors.NeonAura, CircleShape)
    )
}

@Composable
private fun Wordmark() {
    Row(
        verticalAlignment = Alignment.Bottom,
        horizontalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        Letters.forEachIndexed { i, letter ->
            WordmarkLetter(letter = letter, index = i)
        }
    }
}

private val WordmarkBrush = Brush.linearGradient(
    colors = listOf(
        Color.White,
        Color(0xFFB2F5FF),
        ButuColors.NeonAura,
    ),
    start = Offset(0f, 0f),
    end = Offset(80f, 200f),  // ~155° from horizontal
)

@Composable
private fun WordmarkLetter(letter: String, index: Int) {
    val alpha = remember { Animatable(0f) }
    val translateY = remember { Animatable(18f) }

    LaunchedEffect(Unit) {
        delay(350L + index * 90L)
        alpha.animateTo(1f, tween(550))
    }
    LaunchedEffect(Unit) {
        delay(350L + index * 90L)
        translateY.animateTo(0f, tween(550))
    }

    Text(
        text = letter,
        style = TextStyle(
            brush = WordmarkBrush,
            fontFamily = ButuFonts.Display,
            fontWeight = FontWeight.Black,
            fontSize = 108.sp,
            lineHeight = 108.sp,
            letterSpacing = 0.2.em,
        ),
        modifier = Modifier
            .alpha(alpha.value)
            .graphicsLayer { translationY = translateY.value },
    )
}

@Composable
private fun Separator() {
    val scaleX = remember { Animatable(0f) }
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(850)
        scaleX.animateTo(1f, tween(700))
    }
    LaunchedEffect(Unit) {
        delay(850)
        alpha.animateTo(1f, tween(700))
    }
    Box(
        modifier = Modifier
            .width(220.dp)
            .height(1.dp)
            .alpha(alpha.value)
            .graphicsLayer {
                this.scaleX = scaleX.value
                this.transformOrigin = TransformOrigin(0.5f, 0.5f)
            }
            .background(
                brush = Brush.horizontalGradient(
                    colors = listOf(
                        Color.Transparent,
                        ButuColors.NeonAura.copy(alpha = 0.35f),
                        Color.Transparent,
                    ),
                ),
            )
    )
}

@Composable
private fun Tagline() {
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(1_050)
        alpha.animateTo(0.4f, tween(900))
    }
    Text(
        text = "CINEMA · TELEVISION · SOUND",
        color = ButuColors.NeonAura,
        style = ButuType.LabelMd.copy(
            fontSize = 11.sp,
            letterSpacing = 0.35.em,
        ),
        modifier = Modifier.alpha(alpha.value),
    )
}

@Composable
private fun ProgressBar(progress: Float, modifier: Modifier) {
    Box(
        modifier = modifier
            .width(160.dp)
            .height(1.dp)
            .background(
                color = ButuColors.NeonAura.copy(alpha = 0.07f),
                shape = RoundedCornerShape(1.dp),
            ),
    ) {
        Box(
            modifier = Modifier
                .fillMaxSize()
                .graphicsLayer {
                    this.transformOrigin = TransformOrigin(0f, 0.5f)
                    this.scaleX = progress.coerceIn(0f, 1f)
                }
                .shadow(
                    elevation = 8.dp,
                    shape = RoundedCornerShape(1.dp),
                    ambientColor = ButuColors.NeonAura,
                    spotColor = ButuColors.NeonAura,
                    clip = false,
                )
                .background(
                    brush = Brush.horizontalGradient(
                        colors = listOf(
                            ButuColors.NeonAura.copy(alpha = 0.15f),
                            ButuColors.NeonAura,
                        ),
                    ),
                ),
        )
    }
}

@Composable
private fun VersionTag(modifier: Modifier) {
    val alpha = remember { Animatable(0f) }
    LaunchedEffect(Unit) {
        delay(1_500)
        alpha.animateTo(0.18f, tween(1_000))
    }
    Text(
        text = "v${dev.butu.BuildConfig.VERSION_NAME}",
        color = Color.White,
        style = ButuType.LabelMd.copy(
            fontSize = 9.sp,
            letterSpacing = 0.25.em,
        ),
        modifier = modifier.alpha(alpha.value),
    )
}
