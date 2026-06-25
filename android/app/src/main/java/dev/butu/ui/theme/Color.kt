package dev.butu.ui.theme

import androidx.compose.ui.graphics.Color

/**
 * Color tokens — 1:1 with tailwind.config.js.
 * Source of truth: src/index.css + tailwind.config.js (Butu Cinematic Aperture).
 */
object ButuColors {
    // Brand
    val Primary             = Color(0xFF99F7FF)
    val PrimaryContainer    = Color(0xFF00F1FE)
    val OnPrimary           = Color(0xFF001F24)
    val OnPrimaryContainer  = Color(0xFF001F24)

    val Secondary           = Color(0xFFB2CCD0)
    val SecondaryContainer  = Color(0xFF1C3437)
    val OnSecondary         = Color(0xFF1D3438)

    // Surface ladder — depth via stacked containers
    val SurfaceLowest             = Color(0xFF000000)
    val SurfaceLow                = Color(0xFF0A0C10)
    val Surface                   = Color(0xFF0C0E13)
    val SurfaceContainerLow       = Color(0xFF111520)
    val SurfaceContainer          = Color(0xFF161A26)
    val SurfaceContainerHigh      = Color(0xFF1E2330)
    val SurfaceContainerHighest   = Color(0xFF272C3A)
    val SurfaceBright             = Color(0xFF2E3447)
    val SurfaceVariant            = Color(0xFF3A4050)

    val OnSurface         = Color(0xFFE0E6F0)
    val OnSurfaceVariant  = Color(0xFF9AA3B4)

    val Outline          = Color(0xFF4A5268)
    val OutlineVariant   = Color(0xFF2E3447)

    // Aliases
    val NeonAura  = Primary
    val TealNeon  = Primary

    // Glassmorphism fills (alpha baked in per index.css `.glass` / `.glass-sm`)
    val Glass    = Color(0xEB2A303E)   // rgba(42, 48, 62, 0.92)
    val GlassSm  = Color(0xF0121620)   // rgba(18, 22, 32, 0.94)

    // Neon focus glow components
    val NeonGlow15 = Color(0x2699F7FF)  // 15% alpha
    val NeonGlow12 = Color(0x1F99F7FF)  // 12% alpha
    val NeonGlow20 = Color(0x3399F7FF)  // 20% alpha
    val NeonGlow30 = Color(0x4D99F7FF)  // 30% alpha

    // Hero gradient stops (matches `.hero-gradient` / `.hero-gradient-side`)
    val HeroFadeFull   = Color(0xFF000000)
    val HeroFadeStrong = Color(0xD9000000) // 0.85
    val HeroFadeMid    = Color(0x66000000) // 0.40
    val HeroFadeNone   = Color(0x00000000)

    // Side gradient — uses Surface (#0C0E13) instead of pure black
    val HeroSideFull   = Surface
    val HeroSideStrong = Color(0xE60C0E13) // 0.90
    val HeroSideMid    = Color(0x990C0E13) // 0.60
    val HeroSideNone   = Color(0x000C0E13)
}
