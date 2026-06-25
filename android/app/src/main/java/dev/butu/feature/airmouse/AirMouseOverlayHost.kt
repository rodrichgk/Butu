package dev.butu.feature.airmouse

import android.view.KeyEvent
import android.view.MotionEvent
import android.view.View
import android.os.SystemClock
import androidx.activity.ComponentActivity
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberUpdatedState
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.unit.IntSize
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.butu.ui.components.CursorState
import dev.butu.ui.components.LiquidCursorOverlay

/**
 * Starts the air-mouse bridge and maps normalized service coordinates to the
 * full-screen pixel coordinates expected by [LiquidCursorOverlay].
 */
@Composable
fun AirMouseOverlayHost(
    modifier: Modifier = Modifier,
    viewModel: AirMouseViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val view = LocalView.current
    val context = LocalContext.current
    var size by remember { mutableStateOf(IntSize.Zero) }
    val latestState by rememberUpdatedState(state)
    val latestSize by rememberUpdatedState(size)

    LaunchedEffect(viewModel, view, context) {
        viewModel.commands.collect { command ->
            when (command) {
                AirMouseCommand.Select -> {
                    if (latestSize.width > 0 && latestSize.height > 0) {
                        view.dispatchTap(
                            x = latestState.cursorX * latestSize.width,
                            y = latestState.cursorY * latestSize.height,
                        )
                    } else {
                        view.dispatchDpadKey(KeyEvent.KEYCODE_DPAD_CENTER)
                    }
                }
                AirMouseCommand.Back -> {
                    val activity = context as? ComponentActivity
                    if (activity != null) {
                        activity.onBackPressedDispatcher.onBackPressed()
                    } else {
                        view.dispatchDpadKey(KeyEvent.KEYCODE_BACK)
                    }
                }
                is AirMouseCommand.Scroll -> {
                    val keyCode = if (command.direction < 0) {
                        KeyEvent.KEYCODE_DPAD_UP
                    } else {
                        KeyEvent.KEYCODE_DPAD_DOWN
                    }
                    view.dispatchDpadKey(keyCode)
                }
            }
        }
    }

    Box(
        modifier = modifier
            .fillMaxSize()
            .onSizeChanged { size = it },
    ) {
        val cursor = CursorState(
            x = state.cursorX * size.width,
            y = state.cursorY * size.height,
            vx = state.velocityX * size.width,
            vy = state.velocityY * size.height,
            snapped = state.snapped,
            targetId = state.targetId,
        )
        LiquidCursorOverlay(cursorState = cursor, wsConnected = state.connected)
    }
}

private fun View.dispatchDpadKey(keyCode: Int) {
    dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_DOWN, keyCode))
    dispatchKeyEvent(KeyEvent(KeyEvent.ACTION_UP, keyCode))
}

private fun View.dispatchTap(x: Float, y: Float) {
    val downTime = SystemClock.uptimeMillis()
    val down = MotionEvent.obtain(downTime, downTime, MotionEvent.ACTION_DOWN, x, y, 0)
    val up = MotionEvent.obtain(downTime, downTime + 24L, MotionEvent.ACTION_UP, x, y, 0)
    try {
        dispatchTouchEvent(down)
        dispatchTouchEvent(up)
    } finally {
        down.recycle()
        up.recycle()
    }
}
