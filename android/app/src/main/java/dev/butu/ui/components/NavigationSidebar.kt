package dev.butu.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.focusGroup
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxScope
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Album
import androidx.compose.material.icons.outlined.Bolt
import androidx.compose.material.icons.outlined.Home
import androidx.compose.material.icons.outlined.MenuBook
import androidx.compose.material.icons.outlined.Movie
import androidx.compose.material.icons.outlined.Search
import androidx.compose.material.icons.outlined.Settings
import androidx.compose.material.icons.outlined.Tv
import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusProperties
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.focus.onFocusChanged
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.tv.material3.Text
import dev.butu.navigation.Section
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuFonts
import dev.butu.ui.theme.ButuType

private val CollapsedWidth = 56.dp
private val ExpandedWidth  = 196.dp
private val ItemHeight     = 38.dp
private val CircleDiameter = 30.dp
private val PillWidth      = 3.dp
private val PillHeight     = 18.dp
private val PillGap        = 4.dp

private fun Section.icon(): ImageVector = when (this) {
    Section.Home     -> Icons.Outlined.Home
    Section.Movies   -> Icons.Outlined.Movie
    Section.Music    -> Icons.Outlined.Album
    Section.Tv       -> Icons.Outlined.Tv
    Section.Anime    -> Icons.Outlined.Bolt
    Section.Manga    -> Icons.Outlined.MenuBook
    Section.Search   -> Icons.Outlined.Search
    Section.Settings -> Icons.Outlined.Settings
}

private val NavSections = Section.values().toList()

/**
 * Floating glassmorphism sidebar — vertically centered, expands on focus.
 * Mirrors src/components/NavigationSidebar.tsx.
 *
 * - On TV the sidebar expands when any of its items receives focus (matches the
 *   React `onFocus` behavior). There is no hover concept.
 * - The active "pill" indicator and the hover/active glass circle backdrops are
 *   drawn behind the icons; nothing transforms the icon column itself, so D-pad
 *   focus traversal stays predictable.
 */
@OptIn(androidx.compose.ui.ExperimentalComposeUiApi::class)
@Composable
fun NavigationSidebar(
    activeSection: Section,
    onSectionChange: (Section) -> Unit,
    modifier: Modifier = Modifier,
) {
    var expanded by remember { mutableStateOf(false) }
    // One stable FocusRequester per item — each stays attached to its own (always-composed)
    // item. The `enter` redirect below returns the active one. A single shared requester that
    // moves between items would be momentarily attached to nothing while the active section
    // changes, and the focus search crashes if `enter` returns a detached requester.
    val itemRequesters = remember { NavSections.associateWith { FocusRequester() } }

    val width by animateDpAsState(
        targetValue = if (expanded) ExpandedWidth else CollapsedWidth,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioLowBouncy,
            stiffness = Spring.StiffnessMediumLow,
        ),
        label = "sidebar-width",
    )

    Column(
        modifier = modifier
            .width(width)
            .shadow(elevation = 8.dp, shape = RoundedCornerShape(24.dp), clip = false)
            .background(ButuColors.SurfaceLow.copy(alpha = 0.97f), RoundedCornerShape(24.dp))
            .border(1.dp, ButuColors.NeonAura.copy(alpha = 0.08f), RoundedCornerShape(24.dp))
            .padding(top = 10.dp, bottom = 8.dp)
            .onFocusChanged { expanded = it.hasFocus }
            // `focusProperties { enter }` must come BEFORE `focusGroup()` so it applies to the
            // group's focus target — that's what makes D-pad entry land on the active section's
            // item (no matter where focus was in the content) instead of the nearest item.
            .focusProperties {
                enter = { itemRequesters.getValue(activeSection) }
            }
            .focusGroup(),
    ) {
        LogoRow(expanded = expanded)
        Spacer(Modifier.height(4.dp))
        Hairline()
        Spacer(Modifier.height(2.dp))

        NavSections.forEach { section ->
            val isCurrent = section == activeSection
            NavItem(
                section = section,
                isActive = isCurrent,
                expanded = expanded,
                onClick = { onSectionChange(section) },
                modifier = Modifier.focusRequester(itemRequesters.getValue(section)),
            )
        }

        Spacer(Modifier.height(2.dp))
        Hairline()
        StatusDot()
    }
}

@Composable
private fun LogoRow(expanded: Boolean) {
    Row(
        modifier = Modifier.height(ItemHeight),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.width(CollapsedWidth).height(ItemHeight),
            contentAlignment = Alignment.Center,
        ) {
            Box(
                modifier = Modifier
                    .size(30.dp)
                    .background(
                        brush = Brush.linearGradient(
                            colors = listOf(ButuColors.NeonAura, ButuColors.PrimaryContainer),
                        ),
                        shape = RoundedCornerShape(10.dp),
                    ),
                contentAlignment = Alignment.Center,
            ) {
                Text(
                    text = "B",
                    color = ButuColors.OnPrimary,
                    style = ButuType.HeadlineSm.copy(
                        fontFamily = ButuFonts.Display,
                        fontWeight = FontWeight.Black,
                        fontSize = 14.sp,
                        lineHeight = 14.sp,
                    ),
                )
            }
        }

        AnimatedVisibility(
            visible = expanded,
            enter = fadeIn(tween(200)) + slideInHorizontally(tween(200)) { -8 },
            exit = fadeOut(tween(200)) + slideOutHorizontally(tween(200)) { -8 },
        ) {
            Text(
                text = "Butu",
                color = ButuColors.OnSurface,
                style = ButuType.HeadlineSm.copy(
                    fontFamily = ButuFonts.Display,
                    fontWeight = FontWeight.ExtraBold,
                    fontSize = 17.sp,
                ),
            )
        }
    }
}

@Composable
private fun NavItem(
    section: Section,
    isActive: Boolean,
    expanded: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val interactionSource = remember { MutableInteractionSource() }
    val focused by interactionSource.collectIsFocusedAsState()
    val highlight = isActive || focused

    Row(
        modifier = modifier
            .fillMaxWidth()
            .height(ItemHeight)
            .clickable(
                interactionSource = interactionSource,
                indication = null,
                onClick = onClick,
            ),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        Box(
            modifier = Modifier.width(CollapsedWidth).height(ItemHeight),
            contentAlignment = Alignment.Center,
        ) {
            ActivePill(visible = isActive)
            CircleBackdrop(visible = highlight, isActive = isActive)
            NavIconGlyph(icon = section.icon(), isActive = isActive, isFocused = focused)
        }

        AnimatedVisibility(
            visible = expanded,
            enter = fadeIn(tween(200)) + slideInHorizontally(tween(200)) { -6 },
            exit = fadeOut(tween(200)) + slideOutHorizontally(tween(200)) { -6 },
        ) {
            Text(
                text = section.label,
                color = if (isActive) ButuColors.NeonAura else ButuColors.OnSurface.copy(alpha = 0.50f),
                style = ButuType.BodyMd.copy(
                    fontSize = 13.sp,
                    fontWeight = FontWeight.Medium,
                ),
            )
        }
    }
}

/** Vertical neon pill anchored on the sidebar's outer-left edge. */
@Composable
private fun BoxScope.ActivePill(visible: Boolean) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(350)) + scaleIn(tween(350), initialScale = 0.5f),
        exit = fadeOut(tween(350)) + scaleOut(tween(350), targetScale = 0.5f),
        modifier = Modifier.align(Alignment.CenterStart),
    ) {
        Box(
            modifier = Modifier
                .padding(start = PillGap)
                .size(width = PillWidth, height = PillHeight)
                .background(ButuColors.NeonAura, CircleShape)
        )
    }
}

@Composable
private fun BoxScope.CircleBackdrop(visible: Boolean, isActive: Boolean) {
    AnimatedVisibility(
        visible = visible,
        enter = fadeIn(tween(250)) + scaleIn(tween(250), initialScale = 0.72f),
        exit = fadeOut(tween(250)) + scaleOut(tween(250), targetScale = 0.72f),
        modifier = Modifier.align(Alignment.Center),
    ) {
        val borderColor = if (isActive) ButuColors.NeonAura.copy(alpha = 0.22f)
                          else Color.White.copy(alpha = 0.08f)
        val fillColor = if (isActive) ButuColors.NeonAura.copy(alpha = 0.09f)
                        else Color.White.copy(alpha = 0.04f)

        Box(
            modifier = Modifier
                .size(CircleDiameter)
                .background(fillColor, CircleShape)
                .border(1.dp, borderColor, CircleShape)
        )
    }
}

@Composable
private fun NavIconGlyph(icon: ImageVector, isActive: Boolean, isFocused: Boolean) {
    val color by androidx.compose.animation.animateColorAsState(
        targetValue = when {
            isActive  -> ButuColors.NeonAura
            isFocused -> ButuColors.OnSurface.copy(alpha = 0.80f)
            else      -> ButuColors.OnSurface.copy(alpha = 0.38f)
        },
        animationSpec = tween(180),
        label = "nav-icon-color",
    )
    Icon(
        imageVector = icon,
        contentDescription = null,
        tint = color,
        modifier = Modifier.size(20.dp),
    )
}

@Composable
private fun Hairline() {
    Box(
        modifier = Modifier
            .padding(horizontal = 16.dp)
            .fillMaxWidth()
            .height(1.dp)
            .background(ButuColors.NeonAura.copy(alpha = 0.07f))
    )
}

@Composable
private fun StatusDot() {
    Box(
        modifier = Modifier.width(CollapsedWidth).height(24.dp),
        contentAlignment = Alignment.Center,
    ) {
        Box(
            modifier = Modifier
                .size(6.dp)
                .background(ButuColors.NeonAura.copy(alpha = 0.60f), CircleShape)
        )
    }
}
