package dev.butu.feature.airmouse

import androidx.compose.runtime.Immutable
import kotlinx.coroutines.channels.BufferOverflow
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import javax.inject.Inject
import javax.inject.Singleton

@Immutable
data class AirMouseState(
    val connected: Boolean = false,
    val cursorX: Float = 0.5f,
    val cursorY: Float = 0.5f,
    val velocityX: Float = 0f,
    val velocityY: Float = 0f,
    val snapped: Boolean = false,
    val targetId: String? = null,
    val clientAddress: String? = null,
)

sealed interface AirMouseCommand {
    data object Select : AirMouseCommand
    data object Back : AirMouseCommand
    data class Scroll(val direction: Int) : AirMouseCommand
}

/**
 * Process-wide bridge between the foreground WebSocket service and Compose.
 * Coordinates are normalized 0..1; the overlay host maps them to pixels.
 */
@Singleton
class AirMouseRepository @Inject constructor() {

    private val _state = MutableStateFlow(AirMouseState())
    val state: StateFlow<AirMouseState> = _state.asStateFlow()

    private val _commands = MutableSharedFlow<AirMouseCommand>(
        extraBufferCapacity = 32,
        onBufferOverflow = BufferOverflow.DROP_OLDEST,
    )
    val commands: SharedFlow<AirMouseCommand> = _commands.asSharedFlow()

    fun onConnected(clientAddress: String?) {
        _state.update { it.copy(connected = true, clientAddress = clientAddress) }
    }

    fun onDisconnected(clientAddress: String?) {
        _state.update {
            if (it.clientAddress == clientAddress || clientAddress == null) {
                it.copy(connected = false, clientAddress = null, velocityX = 0f, velocityY = 0f)
            } else {
                it
            }
        }
    }

    fun onCursor(x: Float, y: Float, snapped: Boolean = false, targetId: String? = null) {
        _state.update { old ->
            val clampedX = x.coerceIn(0f, 1f)
            val clampedY = y.coerceIn(0f, 1f)
            old.copy(
                cursorX = clampedX,
                cursorY = clampedY,
                velocityX = clampedX - old.cursorX,
                velocityY = clampedY - old.cursorY,
                snapped = snapped,
                targetId = targetId,
            )
        }
    }

    fun onClick() {
        _commands.tryEmit(AirMouseCommand.Select)
    }

    fun onScroll(direction: Int) {
        if (direction <= -999) {
            _commands.tryEmit(AirMouseCommand.Back)
        } else {
            _commands.tryEmit(AirMouseCommand.Scroll(direction))
        }
    }
}
