package dev.butu.feature.airmouse

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import android.os.Build
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import dagger.hilt.android.AndroidEntryPoint
import dev.butu.R
import dev.butu.feature.remote.AIR_MOUSE_SERVICE_TYPE
import io.ktor.server.application.install
import io.ktor.server.cio.CIO
import io.ktor.server.engine.EmbeddedServer
import io.ktor.server.engine.embeddedServer
import io.ktor.server.routing.routing
import io.ktor.server.websocket.WebSockets
import io.ktor.server.websocket.webSocket
import io.ktor.websocket.Frame
import io.ktor.websocket.readText
import io.ktor.websocket.send
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.concurrent.atomic.AtomicInteger
import javax.inject.Inject

private const val WS_PORT = 9001
private const val CHANNEL_ID = "butu_air_mouse"
private const val NOTIFICATION_ID = 9001

/**
 * Native replacement for `src-tauri/src/spatial_bridge.rs`.
 * Hosts ws://<tv-ip>:9001 and accepts the existing controller messages:
 * imu, click, scroll, ping.
 */
@AndroidEntryPoint
class AirMouseService : Service() {

    @Inject lateinit var repository: AirMouseRepository
    @Inject lateinit var json: Json

    private val activeConnections = AtomicInteger(0)
    private var server: EmbeddedServer<*, *>? = null

    private var nsdManager: NsdManager? = null
    private var nsdListener: NsdManager.RegistrationListener? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            buildNotification(),
            ServiceInfo.FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE,
        )
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action != ACTION_STOP) {
            startServerIfNeeded()
        } else {
            stopSelf()
        }
        return START_STICKY
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        unregisterNsd()
        runCatching { server?.stop(gracePeriodMillis = 500, timeoutMillis = 1_000) }
        repository.onDisconnected(clientAddress = null)
        super.onDestroy()
    }

    private fun isPortAvailable(port: Int): Boolean {
        return try {
            java.net.ServerSocket(port).use { it.apply { reuseAddress = true } }
            true
        } catch (e: Exception) {
            false
        }
    }

    private fun startServerIfNeeded() {
        if (server != null) return
        if (!isPortAvailable(WS_PORT)) return

        server = runCatching {
            embeddedServer(CIO, host = "0.0.0.0", port = WS_PORT) {
                install(WebSockets)
                routing {
                    webSocket("/") {
                        val client = "air-mouse"
                        val smoother = ImuSmoother()
                        activeConnections.incrementAndGet()
                        repository.onConnected(client)

                        send("""{"type":"welcome","data":{"server":"SpatialBridge","version":"0.1.0"}}""")

                        try {
                            for (frame in incoming) {
                                if (frame !is Frame.Text) continue
                                val text = frame.readText()
                                if (handleMessage(text, smoother)) {
                                    send("""{"type":"pong"}""")
                                }
                            }
                        } finally {
                            if (activeConnections.decrementAndGet() <= 0) {
                                repository.onDisconnected(client)
                            }
                        }
                    }
                }
            }.also { engine -> engine.start(wait = false) }
        }.getOrElse {
            stopSelf()
            null
        }

        // Advertise on the LAN so remotes discover this TV without a typed IP.
        if (server != null) registerNsd()
    }

    private fun registerNsd() {
        if (nsdListener != null) return
        val info = NsdServiceInfo().apply {
            serviceName = "Butu (${Build.MODEL})"
            serviceType = AIR_MOUSE_SERVICE_TYPE
            port = WS_PORT
        }
        val listener = object : NsdManager.RegistrationListener {
            override fun onServiceRegistered(info: NsdServiceInfo) {}
            override fun onRegistrationFailed(info: NsdServiceInfo, errorCode: Int) {}
            override fun onServiceUnregistered(info: NsdServiceInfo) {}
            override fun onUnregistrationFailed(info: NsdServiceInfo, errorCode: Int) {}
        }
        val manager = getSystemService(NsdManager::class.java)
        runCatching {
            manager.registerService(info, NsdManager.PROTOCOL_DNS_SD, listener)
            nsdManager = manager
            nsdListener = listener
        }
    }

    private fun unregisterNsd() {
        val manager = nsdManager
        val listener = nsdListener
        if (manager != null && listener != null) {
            runCatching { manager.unregisterService(listener) }
        }
        nsdListener = null
    }

    private fun handleMessage(raw: String, smoother: ImuSmoother): Boolean {
        val root = runCatching { json.parseToJsonElement(raw).jsonObject }.getOrNull() ?: return false
        return when (root["type"]?.jsonPrimitive?.content) {
            "imu" -> {
                val data = root["data"]?.jsonObject ?: return false
                val beta = data["beta"]?.jsonPrimitive?.doubleOrNull ?: 0.0
                val gamma = data["gamma"]?.jsonPrimitive?.doubleOrNull ?: 0.0
                val coords = smoother.process(beta = beta, gamma = gamma)
                repository.onCursor(coords.x, coords.y, snapped = false)
                false
            }
            "click" -> {
                repository.onClick()
                false
            }
            "scroll" -> {
                val direction = root["data"]
                    ?.jsonObject
                    ?.get("direction")
                    ?.jsonPrimitive
                    ?.intOrNull
                    ?: 0
                repository.onScroll(direction)
                false
            }
            "ping" -> true
            else -> false
        }
    }

    private fun buildNotification() = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.mipmap.ic_launcher_foreground)
        .setContentTitle(getString(R.string.air_mouse_notification_title))
        .setContentText(getString(R.string.air_mouse_notification_text))
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setPriority(NotificationCompat.PRIORITY_LOW)
        .build()

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        val channel = NotificationChannel(
            CHANNEL_ID,
            getString(R.string.air_mouse_channel_name),
            NotificationManager.IMPORTANCE_LOW,
        )
        manager.createNotificationChannel(channel)
    }

    companion object {
        const val ACTION_START = "dev.butu.airmouse.START"
        const val ACTION_STOP = "dev.butu.airmouse.STOP"

        fun startIntent(context: Context): Intent =
            Intent(context, AirMouseService::class.java).setAction(ACTION_START)
    }
}

private data class ScreenCoords(val x: Float, val y: Float)

private class ImuSmoother {
    private val betaFilter = KalmanFilter(0.0)
    private val gammaFilter = KalmanFilter(0.0)

    fun process(beta: Double, gamma: Double): ScreenCoords {
        val smoothBeta = betaFilter.update(beta)
        val smoothGamma = gammaFilter.update(gamma)

        val clampedGamma = smoothGamma.coerceIn(-45.0, 45.0)
        val clampedBeta = (smoothBeta - 45.0).coerceIn(-45.0, 45.0)

        val x = ((clampedGamma + 45.0) / 90.0).coerceIn(0.0, 1.0).toFloat()
        val y = ((clampedBeta + 45.0) / 90.0).coerceIn(0.0, 1.0).toFloat()
        return ScreenCoords(x, y)
    }
}

private class KalmanFilter(initial: Double) {
    private var x = initial
    private var p = 1.0

    fun update(measurement: Double): Double {
        p += KALMAN_Q
        val k = p / (p + KALMAN_R)
        x += k * (measurement - x)
        p *= 1.0 - k
        return x
    }

    companion object {
        private const val KALMAN_Q = 0.001
        private const val KALMAN_R = 0.1
    }
}
