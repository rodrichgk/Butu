package dev.butu.ui.components

import androidx.compose.animation.core.AnimationSpec
import androidx.compose.animation.core.spring
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.gestures.BringIntoViewSpec
import kotlin.math.abs

/**
 * Scrolls the focused item to a fixed "pivot" position so D-pad navigation feels smooth and
 * identical every time — instead of the default minimal-scroll jump, which moves a different
 * (random-feeling) amount depending on where the item already was (the "fast/slow/snap"
 * inconsistency). This is the Compose-for-TV replacement for the removed `TvLazyRow`'s
 * `pivotOffset`. Provide it via `LocalBringIntoViewSpec` around a `LazyRow`/`LazyColumn`.
 *
 * A spring (not a fixed-duration tween) keeps the glide smooth even when navigation is
 * interrupted mid-scroll.
 */
@OptIn(ExperimentalFoundationApi::class)
class PivotBringIntoViewSpec(
    /** Where the item's leading edge lands, as a fraction of the viewport (0.3 = 30% in). */
    private val parentFraction: Float = 0.3f,
    private val childFraction: Float = 0f,
) : BringIntoViewSpec {

    override val scrollAnimationSpec: AnimationSpec<Float> =
        spring(dampingRatio = 0.85f, stiffness = 220f)

    override fun calculateScrollDistance(offset: Float, size: Float, containerSize: Float): Float {
        val itemSize = abs(size)
        val itemFits = itemSize <= containerSize
        val target = parentFraction * containerSize - childFraction * itemSize
        val available = containerSize - target
        val finalTarget = if (itemFits && available < itemSize) containerSize - itemSize else target
        return offset - finalTarget
    }
}
