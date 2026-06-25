package dev.butu.ui.theme

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.ui.unit.dp

/**
 * Corner radii — DESIGN.md mandates `rounded-lg` (2rem / 32dp) for all cards.
 */
object ButuShapes {
    val CardLg  = RoundedCornerShape(32.dp)   // primary card radius
    val CardXl  = RoundedCornerShape(40.dp)
    val Card2xl = RoundedCornerShape(48.dp)
    val Pill    = RoundedCornerShape(percent = 50)
    val Chip    = RoundedCornerShape(percent = 50)
    val Button  = RoundedCornerShape(percent = 50)
    val Glass   = RoundedCornerShape(28.dp)
    val Sheet   = RoundedCornerShape(topStart = 32.dp, topEnd = 32.dp)
}
