package dev.butu.ui.theme

import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.tv.material3.MaterialTheme as TvMaterialTheme
import androidx.tv.material3.darkColorScheme
import androidx.compose.material3.Typography as M3Typography
import androidx.compose.material3.LocalTextStyle

private val ButuDarkScheme = darkColorScheme(
    primary           = ButuColors.Primary,
    onPrimary         = ButuColors.OnPrimary,
    primaryContainer  = ButuColors.PrimaryContainer,
    onPrimaryContainer = ButuColors.OnPrimaryContainer,
    secondary         = ButuColors.Secondary,
    onSecondary       = ButuColors.OnSecondary,
    secondaryContainer = ButuColors.SecondaryContainer,
    surface           = ButuColors.Surface,
    onSurface         = ButuColors.OnSurface,
    surfaceVariant    = ButuColors.SurfaceVariant,
    onSurfaceVariant  = ButuColors.OnSurfaceVariant,
    border            = ButuColors.Outline,
    borderVariant     = ButuColors.OutlineVariant,
    background        = ButuColors.SurfaceLowest,
    onBackground      = ButuColors.OnSurface,
)

/** Centralized access to our type scale across composables. */
val LocalButuType = staticCompositionLocalOf { ButuType }

@Composable
fun ButuTheme(content: @Composable () -> Unit) {
    TvMaterialTheme(
        colorScheme = ButuDarkScheme,
        typography  = androidx.tv.material3.Typography(),
        shapes      = androidx.tv.material3.Shapes(),
    ) {
        CompositionLocalProvider(
            LocalButuType provides ButuType,
            LocalTextStyle provides ButuType.BodyMd.copy(color = ButuColors.OnSurface),
            content = content,
        )
    }
}
