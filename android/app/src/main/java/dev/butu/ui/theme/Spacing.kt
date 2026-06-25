package dev.butu.ui.theme

import androidx.compose.ui.unit.dp

/**
 * Spacing scale — 1rem = 16dp. Mirrors tailwind.config.js extensions.
 * DESIGN.md mandates `spacing-12 / 16 / 20` between major sections.
 */
object ButuSpacing {
    val xs   = 4.dp
    val sm   = 8.dp
    val md   = 12.dp
    val lg   = 16.dp
    val xl   = 24.dp
    val s12  = 48.dp   // tailwind 12 = 3rem
    val s16  = 64.dp   // tailwind 16 = 4rem
    val s18  = 72.dp
    val s20  = 80.dp   // hero metadata anchor
    val s22  = 88.dp
    val s24  = 96.dp
}
