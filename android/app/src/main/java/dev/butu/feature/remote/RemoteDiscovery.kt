package dev.butu.feature.remote

import android.content.Context
import android.net.nsd.NsdManager
import android.net.nsd.NsdServiceInfo
import dagger.hilt.android.qualifiers.ApplicationContext
import dev.butu.util.NetworkUtil
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import java.util.concurrent.ConcurrentLinkedQueue
import javax.inject.Inject

/** NSD/mDNS service type both the host (AirMouseService) and remote agree on. */
const val AIR_MOUSE_SERVICE_TYPE = "_butu-airmouse._tcp"

data class DiscoveredHost(
    val name: String,
    val host: String,
    val port: Int,
)

/**
 * Zero-config discovery of Butu TV hosts on the LAN via NSD/mDNS, so the remote
 * never needs a typed IP. Hosts advertise [AIR_MOUSE_SERVICE_TYPE] from
 * AirMouseService; we discover, resolve, and surface them as a live list.
 *
 * NsdManager resolves one service at a time, so resolves are serialized through a
 * queue. Our own device also advertises (the host service runs everywhere), so we
 * drop the entry whose address is this device's own IP.
 */
class RemoteDiscovery @Inject constructor(
    @ApplicationContext context: Context,
) {
    private val nsdManager = context.getSystemService(Context.NSD_SERVICE) as NsdManager
    private val ownIp = NetworkUtil.getLocalIpAddress()

    private val _hosts = MutableStateFlow<List<DiscoveredHost>>(emptyList())
    val hosts: StateFlow<List<DiscoveredHost>> = _hosts.asStateFlow()

    private var discoveryListener: NsdManager.DiscoveryListener? = null

    private val resolveQueue = ConcurrentLinkedQueue<NsdServiceInfo>()
    private var resolving = false

    fun start() {
        if (discoveryListener != null) return
        val listener = object : NsdManager.DiscoveryListener {
            override fun onDiscoveryStarted(serviceType: String) {}
            override fun onServiceFound(serviceInfo: NsdServiceInfo) = enqueueResolve(serviceInfo)
            override fun onServiceLost(serviceInfo: NsdServiceInfo) {
                _hosts.update { list -> list.filterNot { it.name == serviceInfo.serviceName } }
            }
            override fun onDiscoveryStopped(serviceType: String) {}
            override fun onStartDiscoveryFailed(serviceType: String, errorCode: Int) {
                runCatching { nsdManager.stopServiceDiscovery(this) }
            }
            override fun onStopDiscoveryFailed(serviceType: String, errorCode: Int) {}
        }
        discoveryListener = listener
        runCatching {
            nsdManager.discoverServices(AIR_MOUSE_SERVICE_TYPE, NsdManager.PROTOCOL_DNS_SD, listener)
        }
    }

    fun stop() {
        discoveryListener?.let { runCatching { nsdManager.stopServiceDiscovery(it) } }
        discoveryListener = null
        resolveQueue.clear()
        resolving = false
        _hosts.value = emptyList()
    }

    @Synchronized
    private fun enqueueResolve(info: NsdServiceInfo) {
        resolveQueue.add(info)
        pump()
    }

    @Synchronized
    private fun pump() {
        if (resolving) return
        val next = resolveQueue.poll() ?: return
        resolving = true
        @Suppress("DEPRECATION") // resolveService/host: fine for minSdk 26; newer API is 34+
        val resolveListener = object : NsdManager.ResolveListener {
            override fun onResolveFailed(serviceInfo: NsdServiceInfo, errorCode: Int) = finishResolve()
            override fun onServiceResolved(serviceInfo: NsdServiceInfo) {
                val host = serviceInfo.host?.hostAddress
                if (host != null && host != ownIp) {
                    val entry = DiscoveredHost(serviceInfo.serviceName, host, serviceInfo.port)
                    _hosts.update { list ->
                        (list.filterNot { it.name == entry.name } + entry).sortedBy { it.name }
                    }
                }
                finishResolve()
            }
        }
        runCatching {
            @Suppress("DEPRECATION")
            nsdManager.resolveService(next, resolveListener)
        }.onFailure { finishResolve() }
    }

    @Synchronized
    private fun finishResolve() {
        resolving = false
        pump()
    }
}
