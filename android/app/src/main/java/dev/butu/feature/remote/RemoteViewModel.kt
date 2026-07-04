package dev.butu.feature.remote

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.butu.data.config.ConfigStore
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

enum class RemoteMode { Gyro, Touch }

data class RemoteUiState(
    val host: String = "",
    val connection: RemoteConnectionState = RemoteConnectionState.Disconnected,
    val mode: RemoteMode = RemoteMode.Gyro,
    val gyroAvailable: Boolean = true,
)

/**
 * Drives the phone-as-remote screen: owns the target host, the WebSocket link
 * ([RemoteClient]) and the gyro reader ([OrientationSensor]), and forwards
 * pointer/button events to the TV. Gyro samples flow straight to the socket while
 * connected; touchpad drags are integrated into a virtual position and sent as the
 * same imu payload so the host can't tell the two modes apart.
 */
@HiltViewModel
class RemoteViewModel @Inject constructor(
    private val client: RemoteClient,
    private val sensor: OrientationSensor,
    private val discovery: RemoteDiscovery,
    private val configStore: ConfigStore,
) : ViewModel() {

    private val host = MutableStateFlow("")
    private val mode = MutableStateFlow(RemoteMode.Gyro)

    /** Live list of Butu TVs found on the LAN (NSD/mDNS), so no IP typing is needed. */
    val discoveredHosts: StateFlow<List<DiscoveredHost>> = discovery.hosts

    // Touch-mode virtual cursor position (0..1), sent as fake beta/gamma.
    private var virtualX = 0.5
    private var virtualY = 0.5

    val uiState: StateFlow<RemoteUiState> =
        combine(host, client.state, mode) { h, conn, m ->
            RemoteUiState(host = h, connection = conn, mode = m, gyroAvailable = sensor.isAvailable)
        }.stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5_000),
            RemoteUiState(gyroAvailable = sensor.isAvailable),
        )

    init {
        viewModelScope.launch {
            configStore.currentAirMouseHost()?.let { host.value = it }
        }
        discovery.start()
    }

    fun setHost(value: String) { host.value = value.trim() }

    /** Tapped a discovered TV: adopt its address and connect. */
    fun connectTo(target: String) {
        host.value = target
        connect()
    }

    fun connect() {
        val target = host.value.trim()
        if (target.isEmpty()) return
        viewModelScope.launch { configStore.setAirMouseHost(target) }
        client.connect(target)
        if (mode.value == RemoteMode.Gyro) startSensor()
    }

    fun disconnect() {
        stopSensor()
        client.disconnect()
    }

    fun setMode(newMode: RemoteMode) {
        if (mode.value == newMode) return
        mode.value = newMode
        if (newMode == RemoteMode.Gyro) {
            if (client.state.value is RemoteConnectionState.Connected) startSensor()
        } else {
            stopSensor()
            virtualX = 0.5
            virtualY = 0.5
        }
    }

    fun recenter() = sensor.recenter()

    /**
     * Finger drag on the touchpad, as a fraction of the pad's size. Integrated into
     * the virtual position, then inverted through the host mapping
     * (x = (gamma+45)/90, y = beta/90) so a drag reads as a tilt.
     */
    fun onTouchpadDrag(dxFraction: Double, dyFraction: Double) {
        if (client.state.value !is RemoteConnectionState.Connected) return
        virtualX = (virtualX + dxFraction).coerceIn(0.0, 1.0)
        virtualY = (virtualY + dyFraction).coerceIn(0.0, 1.0)
        val gamma = virtualX * 90.0 - 45.0
        val beta = virtualY * 90.0
        client.sendImu(beta, gamma)
    }

    fun click() = client.sendClick()
    fun back() = client.sendBack()
    fun scrollUp() = client.sendScroll(-1)
    fun scrollDown() = client.sendScroll(1)

    private fun startSensor() {
        if (!sensor.isAvailable) return
        sensor.recenter()
        sensor.start { beta, gamma ->
            if (client.state.value is RemoteConnectionState.Connected) {
                client.sendImu(beta, gamma)
            }
        }
    }

    private fun stopSensor() = sensor.stop()

    override fun onCleared() {
        stopSensor()
        discovery.stop()
        client.disconnect()
    }
}
