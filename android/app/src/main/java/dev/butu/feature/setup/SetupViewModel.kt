package dev.butu.feature.setup

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.butu.data.config.ConfigStore
import dev.butu.data.config.PlexConfig
import dev.butu.data.config.ServerType
import dev.butu.data.jellyfin.JellyfinRepository
import dev.butu.data.plex.PlexRepository
import dev.butu.data.plex.PlexResourceDto
import kotlinx.coroutines.Job
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.receiveAsFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Plex is discovery-driven: Login → SelectServer (auto-found via plex.tv). The
 * Server step is the manual fallback there. Jellyfin has no discovery API, so it
 * stays Server → Login.
 */
enum class SetupStep { Server, Login, SelectServer }

/**
 * `Qr` covers both Plex's PIN flow and Jellyfin's Quick Connect — they're conceptually
 * identical (display a code, poll until approved). `Token` is Plex-only.
 */
enum class LoginMode { Qr, Password, Token }

data class CodeLinkState(
    /** Identifier we poll against (Plex pin id, Jellyfin Quick Connect secret). */
    val pollKey: String,
    /** Short code shown to the user. */
    val code: String,
    /** URL the QR points at. Null for Jellyfin (no public link page). */
    val authUrl: String?,
)

data class SetupUiState(
    val step: SetupStep = SetupStep.Login,        // Plex (default) starts at Login
    val backend: ServerType = ServerType.Plex,
    val serverUrl: String = "http://192.168.1.53:32400",
    val loginMode: LoginMode = LoginMode.Qr,
    val username: String = "",
    val password: String = "",
    val token: String = "",
    val pin: CodeLinkState? = null,
    val pollingPin: Boolean = false,
    // Discovery
    val servers: List<PlexResourceDto> = emptyList(),
    val discovering: Boolean = false,
    val connectingServerId: String? = null,       // server being connection-tested
    val loading: Boolean = false,
    val error: String? = null,
)

private const val POLL_INTERVAL_MS = 2_000L
private const val PIN_TIMEOUT_MS = 15 * 60 * 1_000L

@HiltViewModel
class SetupViewModel @Inject constructor(
    private val configStore: ConfigStore,
    private val plexRepo: PlexRepository,
    private val jellyfinRepo: JellyfinRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SetupUiState())
    val state: StateFlow<SetupUiState> = _state.asStateFlow()

    private val _completion = Channel<Unit>(Channel.BUFFERED)
    val completion = _completion.receiveAsFlow()

    private var pollJob: Job? = null

    /** Account token held between sign-in and choosing a server. */
    private var plexToken: String? = null

    init {
        // Default backend is Plex on the QR step → start the PIN flow immediately.
        if (_state.value.backend == ServerType.Plex && _state.value.loginMode == LoginMode.Qr) {
            startPinFlow()
        }
    }

    fun setBackend(backend: ServerType) {
        if (_state.value.backend == backend) return
        cancelPinFlow()
        plexToken = null
        _state.update {
            it.copy(
                backend = backend,
                error = null, pin = null, username = "", password = "", token = "",
                servers = emptyList(), discovering = false, connectingServerId = null,
                // Jellyfin has no token mode; fall back to QR there.
                loginMode = if (backend == ServerType.Jellyfin && it.loginMode == LoginMode.Token) LoginMode.Qr
                            else it.loginMode,
                // Plex starts at Login (discovery); Jellyfin needs a server first.
                step = if (backend == ServerType.Plex) SetupStep.Login else SetupStep.Server,
            )
        }
        if (backend == ServerType.Plex && _state.value.loginMode == LoginMode.Qr) startPinFlow()
    }

    fun setServerUrl(value: String) = _state.update { it.copy(serverUrl = value, error = null) }
    fun setUsername(value: String)  = _state.update { it.copy(username = value, error = null) }
    fun setPassword(value: String)  = _state.update { it.copy(password = value, error = null) }
    fun setToken(value: String)     = _state.update { it.copy(token = value, error = null) }

    fun setLoginMode(mode: LoginMode) {
        if (_state.value.loginMode == mode) return
        _state.update { it.copy(loginMode = mode, error = null, pin = null) }
        if (mode == LoginMode.Qr) startPinFlow() else cancelPinFlow()
    }

    /** Login → Server (Jellyfin) back, used by the back affordance. */
    fun goBackToServer() {
        cancelPinFlow()
        _state.update { it.copy(step = SetupStep.Server, error = null, pin = null) }
    }

    /** SelectServer → Server: switch to manual address entry (keeps the token). */
    fun enterManually() {
        _state.update { it.copy(step = SetupStep.Server, error = null, connectingServerId = null) }
    }

    /** Server (manual) → SelectServer: back to the discovered list. */
    fun backToServers() {
        if (_state.value.servers.isNotEmpty()) {
            _state.update { it.copy(step = SetupStep.SelectServer, error = null) }
        }
    }

    /** Reset to the start: re-login. */
    fun startOver() {
        cancelPinFlow()
        plexToken = null
        val backend = _state.value.backend
        _state.update {
            it.copy(
                step = if (backend == ServerType.Plex) SetupStep.Login else SetupStep.Server,
                servers = emptyList(), discovering = false, connectingServerId = null,
                error = null, pin = null, token = "", password = "",
            )
        }
        if (backend == ServerType.Plex && _state.value.loginMode == LoginMode.Qr) startPinFlow()
    }

    /**
     * Server step "Continue":
     *  - Jellyfin → verify reachability, advance to Login.
     *  - Plex with a token already (manual fallback) → verify + complete.
     *  - Plex without a token → verify, advance to Login.
     */
    fun verifyServer() {
        val current = _state.value
        if (current.loading) return
        val clean = current.serverUrl.trim().trimEnd('/')

        val tok = plexToken
        if (current.backend == ServerType.Plex && tok != null) {
            completePlexWithUrl(tok, clean)
            return
        }

        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching {
                when (current.backend) {
                    ServerType.Plex     -> plexRepo.verifyServer(clean)
                    ServerType.Jellyfin -> jellyfinRepo.verifyServer(clean)
                }
            }
                .onSuccess {
                    _state.update { it.copy(loading = false, serverUrl = clean, step = SetupStep.Login) }
                    if (_state.value.loginMode == LoginMode.Qr) startPinFlow()
                }
                .onFailure {
                    val name = if (current.backend == ServerType.Plex) "Plex" else "Jellyfin"
                    val port = if (current.backend == ServerType.Plex) "32400" else "8096"
                    _state.update {
                        it.copy(loading = false, error = "Could not reach $name. Use the server's LAN IP, e.g. http://192.168.1.53:$port.")
                    }
                }
        }
    }

    fun signIn() {
        val current = _state.value
        if (current.loading) return
        if (current.username.isBlank() || current.password.isBlank()) {
            _state.update { it.copy(error = "Username and password required") }
            return
        }
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching {
                when (current.backend) {
                    ServerType.Plex -> {
                        val token = plexRepo.signIn(current.username.trim(), current.password)
                        onPlexToken(token) // discovery takes over (resets loading)
                    }
                    ServerType.Jellyfin -> {
                        val clean = current.serverUrl.trim().trimEnd('/')
                        val cfg = jellyfinRepo.authenticate(clean, current.username.trim(), current.password)
                        configStore.setJellyfin(cfg)
                        configStore.setServerType(ServerType.Jellyfin)
                        _state.update { it.copy(loading = false, password = "") }
                        _completion.trySend(Unit)
                    }
                }
            }.onFailure { e ->
                _state.update { it.copy(loading = false, error = e.message ?: "Login failed. Check your credentials.") }
            }
        }
    }

    /** Plex-only — paste an existing X-Plex-Token, then discover servers. */
    fun signInWithToken() {
        val current = _state.value
        if (current.loading || current.backend != ServerType.Plex) return
        val raw = current.token.trim()
        if (raw.isBlank()) {
            _state.update { it.copy(error = "Paste your Plex token to continue") }
            return
        }
        onPlexToken(raw)
    }

    /** Connection-tests a discovered server (local → remote → relay) and connects. */
    fun selectServer(server: PlexResourceDto) {
        if (_state.value.connectingServerId != null) return
        viewModelScope.launch {
            _state.update { it.copy(connectingServerId = server.clientIdentifier, error = null) }
            val uri = runCatching { plexRepo.pickConnection(server) }.getOrNull()
            if (uri != null) {
                configStore.setPlex(PlexConfig(serverUrl = uri, token = server.accessToken ?: plexToken.orEmpty()))
                configStore.setServerType(ServerType.Plex)
                _state.update { it.copy(connectingServerId = null) }
                _completion.trySend(Unit)
            } else {
                _state.update {
                    it.copy(connectingServerId = null,
                        error = "Couldn't reach \"${server.name}\". It may be offline — try entering its address manually.")
                }
            }
        }
    }

    fun startPinFlow() {
        cancelPinFlow()
        when (_state.value.backend) {
            ServerType.Plex     -> startPlexPin()
            ServerType.Jellyfin -> startJellyfinQuickConnect()
        }
    }

    private fun startPlexPin() {
        pollJob = viewModelScope.launch {
            _state.update { it.copy(pollingPin = true, error = null, pin = null) }
            val pin = runCatching { plexRepo.createPin() }
                .onFailure { e ->
                    _state.update { it.copy(pollingPin = false, error = "plex.tv unreachable: ${e.message}") }
                }
                .getOrNull() ?: return@launch

            _state.update {
                it.copy(pin = CodeLinkState(
                    pollKey = pin.id.toString(),
                    code = pin.code,
                    authUrl = plexRepo.pinAuthUrl(pin.code),
                ))
            }

            val deadline = System.currentTimeMillis() + PIN_TIMEOUT_MS
            while (System.currentTimeMillis() < deadline) {
                delay(POLL_INTERVAL_MS)
                val polled = runCatching { plexRepo.pollPin(pin.id) }.getOrNull()
                val token = polled?.authToken
                if (!token.isNullOrBlank()) {
                    onPlexToken(token)
                    return@launch
                }
            }
            _state.update { it.copy(pollingPin = false, error = "PIN expired — generate a new one.", pin = null) }
        }
    }

    private fun startJellyfinQuickConnect() {
        val serverUrl = _state.value.serverUrl.trim().trimEnd('/')
        if (serverUrl.isBlank()) return
        pollJob = viewModelScope.launch {
            _state.update { it.copy(pollingPin = true, error = null, pin = null) }
            val initial = runCatching { jellyfinRepo.quickConnectInitiate(serverUrl) }
                .onFailure { e ->
                    _state.update {
                        it.copy(
                            pollingPin = false,
                            error = "Quick Connect unavailable. Enable it in Jellyfin Dashboard → General. (${e.message})",
                        )
                    }
                }
                .getOrNull() ?: return@launch

            _state.update {
                it.copy(pin = CodeLinkState(
                    pollKey = initial.secret,
                    code = initial.code,
                    authUrl = "$serverUrl/web/index.html#!/quickconnect.html",
                ))
            }

            val deadline = System.currentTimeMillis() + PIN_TIMEOUT_MS
            while (System.currentTimeMillis() < deadline) {
                delay(POLL_INTERVAL_MS)
                val polled = runCatching { jellyfinRepo.quickConnectPoll(serverUrl, initial.secret) }.getOrNull()
                if (polled?.authenticated == true) {
                    completeJellyfinWithSecret(serverUrl, initial.secret)
                    return@launch
                }
            }
            _state.update { it.copy(pollingPin = false, error = "Code expired — generate a new one.", pin = null) }
        }
    }

    private fun cancelPinFlow() {
        pollJob?.cancel()
        pollJob = null
        _state.update { it.copy(pollingPin = false) }
    }

    /** Got a Plex account token (PIN / password / paste) → discover the account's servers. */
    private fun onPlexToken(token: String) {
        cancelPinFlow()
        plexToken = token
        _state.update {
            it.copy(step = SetupStep.SelectServer, discovering = true, loading = false,
                pollingPin = false, error = null, password = "", token = "", pin = null, servers = emptyList())
        }
        viewModelScope.launch {
            val servers = runCatching { plexRepo.fetchResources(token) }.getOrElse { emptyList() }
            if (servers.isEmpty()) {
                _state.update {
                    it.copy(discovering = false, step = SetupStep.Server,
                        error = "No servers found on your account — enter the address manually.")
                }
            } else {
                _state.update { it.copy(discovering = false, servers = servers) }
            }
        }
    }

    /** Manual fallback: verify the typed URL with the token we already have, then finish. */
    private fun completePlexWithUrl(token: String, url: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching {
                plexRepo.verifyServer(url, token)
                configStore.setPlex(PlexConfig(serverUrl = url, token = token))
                configStore.setServerType(ServerType.Plex)
            }
                .onSuccess {
                    _state.update { it.copy(loading = false) }
                    _completion.trySend(Unit)
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(loading = false, error = e.message ?: "Could not reach that server with your account.")
                    }
                }
        }
    }

    private fun completeJellyfinWithSecret(serverUrl: String, secret: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            runCatching {
                val cfg = jellyfinRepo.authenticateWithQuickConnect(serverUrl, secret)
                configStore.setJellyfin(cfg)
                configStore.setServerType(ServerType.Jellyfin)
            }
                .onSuccess {
                    cancelPinFlow()
                    _state.update { it.copy(loading = false, pin = null, password = "") }
                    _completion.trySend(Unit)
                }
                .onFailure { e ->
                    _state.update {
                        it.copy(loading = false, pollingPin = false,
                            error = e.message ?: "Quick Connect rejected.")
                    }
                }
        }
    }

    override fun onCleared() {
        pollJob?.cancel()
        super.onCleared()
    }
}
