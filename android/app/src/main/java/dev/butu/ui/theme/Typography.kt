package dev.butu.ui.theme

import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.googlefonts.Font
import androidx.compose.ui.text.googlefonts.GoogleFont
import androidx.compose.ui.unit.em
import androidx.compose.ui.unit.sp
import dev.butu.R

private val provider = GoogleFont.Provider(
    providerAuthority = "com.google.android.gms.fonts",
    providerPackage   = "com.google.android.gms",
    certificates      = R.array.com_google_android_gms_fonts_certs
)

private fun gFont(name: String, weight: FontWeight) =
    Font(googleFont = GoogleFont(name), fontProvider = provider, weight = weight, style = FontStyle.Normal)

/**
 * Typography families — 1:1 with tailwind `fontFamily`.
 * - Display:  Plus Jakarta Sans  (movie titles, headlines)
 * - Body:     Manrope             (synopses, descriptions)
 * - Mono:     Space Grotesk       (technical metadata: 4K, year, codec)
 */
object ButuFonts {
    val Display = FontFamily(
        gFont("Plus Jakarta Sans", FontWeight.Normal),
        gFont("Plus Jakarta Sans", FontWeight.Medium),
        gFont("Plus Jakarta Sans", FontWeight.SemiBold),
        gFont("Plus Jakarta Sans", FontWeight.Bold),
        gFont("Plus Jakarta Sans", FontWeight.ExtraBold),
    )
    val Body = FontFamily(
        gFont("Manrope", FontWeight.Normal),
        gFont("Manrope", FontWeight.Medium),
        gFont("Manrope", FontWeight.SemiBold),
        gFont("Manrope", FontWeight.Bold),
    )
    val Mono = FontFamily(
        gFont("Space Grotesk", FontWeight.Normal),
        gFont("Space Grotesk", FontWeight.Medium),
        gFont("Space Grotesk", FontWeight.SemiBold),
        gFont("Space Grotesk", FontWeight.Bold),
    )
}

/**
 * Type scale — 1:1 with tailwind.config.js `fontSize`.
 * 1rem = 16sp; line-height multipliers preserved via lineHeight in sp.
 */
object ButuType {
    // Display
    val DisplayLg = TextStyle(
        fontFamily = ButuFonts.Display,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 72.sp,
        lineHeight = 76.sp, // 4.5rem * 1.05
    )
    val DisplayMd = TextStyle(
        fontFamily = ButuFonts.Display,
        fontWeight = FontWeight.ExtraBold,
        fontSize = 56.sp,
        lineHeight = 60.sp,
    )
    val DisplaySm = TextStyle(
        fontFamily = ButuFonts.Display,
        fontWeight = FontWeight.Bold,
        fontSize = 44.sp,
        lineHeight = 48.sp,
    )

    // Headline
    val HeadlineLg = TextStyle(
        fontFamily = ButuFonts.Display,
        fontWeight = FontWeight.Bold,
        fontSize = 32.sp,
        lineHeight = 37.sp,
    )
    val HeadlineMd = TextStyle(
        fontFamily = ButuFonts.Display,
        fontWeight = FontWeight.SemiBold,
        fontSize = 24.sp,
        lineHeight = 29.sp,
    )
    val HeadlineSm = TextStyle(
        fontFamily = ButuFonts.Display,
        fontWeight = FontWeight.SemiBold,
        fontSize = 20.sp,
        lineHeight = 25.sp,
    )

    // Body
    val BodyLg = TextStyle(
        fontFamily = ButuFonts.Body,
        fontWeight = FontWeight.Normal,
        fontSize = 18.sp,
        lineHeight = 29.sp,
    )
    val BodyMd = TextStyle(
        fontFamily = ButuFonts.Body,
        fontWeight = FontWeight.Normal,
        fontSize = 16.sp,
        lineHeight = 26.sp,
    )

    // Labels (technical metadata uses Mono variant)
    val LabelLg = TextStyle(
        fontFamily = ButuFonts.Body,
        fontWeight = FontWeight.SemiBold,
        fontSize = 14.sp,
        lineHeight = 20.sp,
    )
    val LabelMd = TextStyle(
        fontFamily = ButuFonts.Mono,
        fontWeight = FontWeight.SemiBold,
        fontSize = 12.sp,
        lineHeight = 17.sp,
        letterSpacing = 0.08.em,
    )
}
