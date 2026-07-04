package dev.butu.feature.remote

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import kotlinx.serialization.json.putJsonObject
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

sealed interface RemoteConnectionState {
    data object Disconnected : RemoteConnectionState
    data object Connecting : RemoteConnectionState
    data object Connected : RemoteConnectionState
    data class Error(val message: String) : RemoteConnectionState
}

private const val WS_PORT = 9001

/**
 * Phone-side counterpart to the host [dev.butu.feature.airmouse.AirMouseService].
 * Opens a plain-LAN WebSocket to ws://<host>:9001 and speaks the exact protocol
 * the host already understands — imu / click / scroll. No cloud, no HTTPS: the
 * phone talks straight to the TV over Wi-Fi, so cursor updates run at LAN latency.
 */
@Singleton
class RemoteClient @Inject constructor(
    okHttpClient: OkHttpClient,
) {
    // Derive a websocket-tuned client from the shared one: ping keepalive so an
    // idle pointer link isn't reaped, and no read timeout on the long-lived socket
    // (the host only speaks when it has something to say).
    private val client = okHttpClient.newBuilder()
        .pingInterval(20, TimeUnit.SECONDS)
        .readTimeout(0, TimeUnit.SECONDS)
        .build()

    private val _state = MutableStateFlow<RemoteConnectionState>(RemoteConnectionState.Disconnected)
    val state: StateFlow<RemoteConnectionState> = _state.asStateFlow()

    private var webSocket: WebSocket? = null

    fun connect(host: String) {
        disconnect()
        _state.value = RemoteConnectionState.Connecting
        val request = Request.Builder().url("ws://$host:$WS_PORT/").build()
        webSocket = client.newWebSocket(request, object : WebSocketListener() {
            override fun onOpen(webSocket: WebSocket, response: Response) {
                _state.value = RemoteConnectionState.Connected
            }

            override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
                _state.value = RemoteConnectionState.Error(t.message ?: "Connection failed")
            }

            override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
                webSocket.close(1000, null)
            }

            override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
                // Don't clobber an Error state set by onFailure.
                if (_state.value !is RemoteConnectionState.Error) {
                    _state.value = RemoteConnectionState.Disconnected
                }
            }
        })
    }

    fun sendImu(beta: Double, gamma: Double) {
        val msg = buildJsonObject {
            put("type", "imu")
            putJsonObject("data") {
                put("alpha", 0.0)
                put("beta", beta)
                put("gamma", gamma)
                put("timestamp", System.currentTimeMillis())
            }
        }
        webSocket?.send(msg.toString())
    }

    fun sendClick() {
        val msg = buildJsonObject {
            put("type", "click")
            put("data", JsonNull)
        }
        webSocket?.send(msg.toString())
    }

    fun sendScroll(direction: Int) {
        val msg = buildJsonObject {
            put("type", "scroll")
            putJsonObject("data") { put("direction", direction) }
        }
        webSocket?.send(msg.toString())
    }

    /** The host treats -999 as a Back gesture (see AirMouseRepository.onScroll). */
    fun sendBack() = sendScroll(-999)

    fun disconnect() {
        webSocket?.close(1000, null)
        webSocket = null
        _state.value = RemoteConnectionState.Disconnected
    }
}
