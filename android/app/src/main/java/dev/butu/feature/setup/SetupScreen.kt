package dev.butu.feature.setup

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.AnimatedContentTransitionScope
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.Image
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsFocusedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.KeyboardArrowLeft
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.ui.unit.Dp
import dev.butu.data.plex.PlexResourceDto
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.draw.scale
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.PasswordVisualTransformation
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.unit.em
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.shape.CircleShape
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.tv.material3.Text
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuFonts
import dev.butu.ui.theme.ButuType

@Composable
fun SetupScreen(
    onCompleted: () -> Unit,
    viewModel: SetupViewModel = hiltViewModel(),
) {
    val state by viewModel.state.collectAsStateWithLifecycle()

    LaunchedEffect(viewModel) {
        viewModel.completion.collect { onCompleted() }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black),
        contentAlignment = Alignment.Center,
    ) {
        AmbientGlow()

        Column(
            modifier = Modifier
                .width(460.dp)
                .fillMaxHeight()
                .verticalScroll(rememberScrollState())
                .padding(vertical = 32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center,
        ) {
            BrandHeader()

            Spacer(Modifier.height(20.dp))

            Card {
                AnimatedContent(
                    targetState = state.step,
                    transitionSpec = { stepTransition(targetState, initialState) },
                    label = "setup-step",
                ) { step ->
                    when (step) {
                        SetupStep.Server -> ServerStep(
                            state = state,
                            onValueChange = viewModel::setServerUrl,
                            onBackendChange = viewModel::setBackend,
                            onContinue = viewModel::verifyServer,
                            onBackToServers = viewModel::backToServers,
                            onStartOver = viewModel::startOver,
                        )
                        SetupStep.SelectServer -> SelectServerStep(
                            state = state,
                            onSelect = viewModel::selectServer,
                            onManual = viewModel::enterManually,
                            onStartOver = viewModel::startOver,
                        )
                        SetupStep.Login -> LoginStep(
                            state = state,
                            onBackendChange = viewModel::setBackend,
                            onUsername = viewModel::setUsername,
                            onPassword = viewModel::setPassword,
                            onSignIn = viewModel::signIn,
                            onToken = viewModel::setToken,
                            onSignInWithToken = viewModel::signInWithToken,
                            onModeChange = viewModel::setLoginMode,
                            onRetryPin = viewModel::startPinFlow,
                            onBack = viewModel::goBackToServer,
                        )
                    }
                }

                AnimatedVisibility(visible = state.error != null) {
                    Text(
                        text = state.error.orEmpty(),
                        color = Color(0xFFFF6B6B),
                        style = ButuType.BodyMd.copy(fontSize = 14.sp),
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(top = 16.dp),
                    )
                }
            }

            Spacer(Modifier.height(24.dp))

            Text(
                text = "Your credentials are stored locally and never leave this device",
                color = Color.White.copy(alpha = 0.20f),
                style = ButuType.BodyMd.copy(fontSize = 12.sp),
            )
        }
    }
}

@Composable
private fun AmbientGlow() {
    Box(modifier = Modifier
        .fillMaxSize()
        .drawBehind {
            drawRect(
                brush = Brush.radialGradient(
                    colors = listOf(
                        ButuColors.NeonAura.copy(alpha = 0.04f),
                        Color.Transparent,
                    ),
                    center = Offset(size.width / 2f, size.height * 0.30f),
                    radius = size.minDimension * 0.80f,
                )
            )
        }
    )
}

@Composable
private fun BrandHeader() {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = "butu",
            color = Color.White,
            style = ButuType.DisplayMd.copy(
                fontFamily = ButuFonts.Display,
                fontWeight = FontWeight.Black,
                fontSize = 34.sp,
                letterSpacing = (-0.03).em,
            ),
        )
        Spacer(Modifier.height(2.dp))
        Text(
            text = "CONNECT YOUR MEDIA SERVER",
            color = ButuColors.OnSurfaceVariant,
            style = ButuType.LabelMd.copy(fontSize = 11.sp),
        )
    }
}

@Composable
private fun Card(content: @Composable () -> Unit) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .shadow(32.dp, RoundedCornerShape(24.dp), clip = false)
            .background(Color(0xD90E111B), RoundedCornerShape(24.dp))
            .border(1.dp, ButuColors.NeonAura.copy(alpha = 0.10f), RoundedCornerShape(24.dp))
            .padding(24.dp)
    ) {
        content()
    }
}

@Composable
private fun ServerStep(
    state: SetupUiState,
    onValueChange: (String) -> Unit,
    onBackendChange: (dev.butu.data.config.ServerType) -> Unit,
    onContinue: () -> Unit,
    onBackToServers: () -> Unit,
    onStartOver: () -> Unit,
) {
    val focusRequester = remember { FocusRequester() }
    LaunchedEffect(state.backend) { focusRequester.requestFocus() }

    val isPlex = state.backend == dev.butu.data.config.ServerType.Plex
    // Reached here from discovery (already signed in) → it's the manual fallback.
    val manualFallback = isPlex && state.servers.isNotEmpty()

    Column {
        StepHeading(
            title = if (manualFallback) "Enter address" else "Server URL",
            subtitle = if (isPlex) "Enter the address of your Plex Media Server"
                       else "Enter the address of your Jellyfin server",
        )
        Spacer(Modifier.height(20.dp))

        if (!manualFallback) {
            BackendChooser(selected = state.backend, onSelect = onBackendChange)
            Spacer(Modifier.height(20.dp))
        }

        SetupTextField(
            value = state.serverUrl,
            onValueChange = onValueChange,
            placeholder = if (isPlex) "http://192.168.1.53:32400" else "http://192.168.1.53:8096",
            keyboardType = KeyboardType.Uri,
            imeAction = ImeAction.Go,
            onImeAction = onContinue,
            modifier = Modifier.focusRequester(focusRequester),
        )
        Spacer(Modifier.height(16.dp))

        GradientButton(
            label = if (state.loading) "Connecting…" else if (manualFallback) "Connect →" else "Continue →",
            loading = state.loading,
            onClick = onContinue,
        )

        if (manualFallback) {
            Spacer(Modifier.height(16.dp))
            Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
                TextLink(label = "← Back to servers", onClick = onBackToServers)
                TextLink(label = "Start over", onClick = onStartOver)
            }
        }
    }
}

@Composable
private fun SelectServerStep(
    state: SetupUiState,
    onSelect: (PlexResourceDto) -> Unit,
    onManual: () -> Unit,
    onStartOver: () -> Unit,
) {
    Column {
        StepHeading(
            title = "Choose a server",
            subtitle = "Servers on your Plex account, including ones shared with you",
        )
        Spacer(Modifier.height(20.dp))

        if (state.discovering) {
            Box(modifier = Modifier.fillMaxWidth().padding(vertical = 28.dp), contentAlignment = Alignment.Center) {
                Spinner()
            }
        } else {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                state.servers.forEach { server ->
                    ServerRow(
                        server = server,
                        connecting = state.connectingServerId == server.clientIdentifier,
                        enabled = state.connectingServerId == null,
                        onClick = { onSelect(server) },
                    )
                }
            }
        }

        Spacer(Modifier.height(16.dp))
        Row(modifier = Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.SpaceBetween) {
            TextLink(label = "Enter address manually", onClick = onManual)
            TextLink(label = "Start over", onClick = onStartOver)
        }
    }
}

@Composable
private fun ServerRow(
    server: PlexResourceDto,
    connecting: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier
            .fillMaxWidth()
            .background(
                color = if (focused) ButuColors.NeonAura.copy(alpha = 0.12f) else Color(0xB3161A26),
                shape = RoundedCornerShape(14.dp),
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = if (focused) ButuColors.NeonAura.copy(alpha = 0.70f) else ButuColors.NeonAura.copy(alpha = 0.10f),
                shape = RoundedCornerShape(14.dp),
            )
            .clickable(interactionSource = source, indication = null, enabled = enabled, onClick = onClick)
            .padding(horizontal = 16.dp, vertical = 14.dp),
    ) {
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = server.name,
                color = ButuColors.OnSurface,
                style = ButuType.LabelLg.copy(fontWeight = FontWeight.SemiBold, fontSize = 15.sp),
            )
            Spacer(Modifier.height(2.dp))
            Text(
                text = if (server.owned) "YOUR SERVER" else "SHARED WITH YOU",
                color = if (server.owned) ButuColors.NeonAura.copy(alpha = 0.80f) else Color(0xFFC0A0FF),
                style = ButuType.LabelMd.copy(fontSize = 10.sp, letterSpacing = 0.1.em),
            )
        }
        if (connecting) Spinner(size = 16.dp)
        else Text(text = "→", color = ButuColors.NeonAura, style = ButuType.HeadlineSm.copy(fontSize = 18.sp))
    }
}

@Composable
private fun Spinner(size: Dp = 28.dp) {
    CircularProgressIndicator(
        modifier = Modifier.size(size),
        color = ButuColors.NeonAura,
        strokeWidth = 2.dp,
    )
}

@Composable
private fun TextLink(label: String, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Text(
        text = label,
        color = if (focused) Color.White else Color.White.copy(alpha = 0.40f),
        style = ButuType.BodyMd.copy(fontSize = 13.sp),
        modifier = Modifier.clickable(interactionSource = source, indication = null, onClick = onClick),
    )
}

@Composable
private fun BackendChooser(
    selected: dev.butu.data.config.ServerType,
    onSelect: (dev.butu.data.config.ServerType) -> Unit,
) {
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        BackendTab(
            label = "Plex",
            active = selected == dev.butu.data.config.ServerType.Plex,
            onClick = { onSelect(dev.butu.data.config.ServerType.Plex) },
            modifier = Modifier.weight(1f),
        )
        BackendTab(
            label = "Jellyfin",
            active = selected == dev.butu.data.config.ServerType.Jellyfin,
            onClick = { onSelect(dev.butu.data.config.ServerType.Jellyfin) },
            modifier = Modifier.weight(1f),
        )
    }
}

@Composable
private fun BackendTab(
    label: String,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val highlight = active || focused

    Box(
        modifier = modifier
            .background(
                color = if (highlight) ButuColors.NeonAura.copy(alpha = if (active) 0.18f else 0.10f)
                        else Color.White.copy(alpha = 0.04f),
                shape = RoundedCornerShape(12.dp),
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    focused -> ButuColors.NeonAura.copy(alpha = 0.85f)
                    active  -> ButuColors.NeonAura.copy(alpha = 0.45f)
                    else    -> Color.White.copy(alpha = 0.08f)
                },
                shape = RoundedCornerShape(12.dp),
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .padding(vertical = 12.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (highlight) ButuColors.NeonAura else Color.White.copy(alpha = 0.55f),
            style = ButuType.LabelLg.copy(
                fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                fontSize = 13.sp,
            ),
        )
    }
}

@Composable
private fun LoginStep(
    state: SetupUiState,
    onBackendChange: (dev.butu.data.config.ServerType) -> Unit,
    onUsername: (String) -> Unit,
    onPassword: (String) -> Unit,
    onSignIn: () -> Unit,
    onToken: (String) -> Unit,
    onSignInWithToken: () -> Unit,
    onModeChange: (LoginMode) -> Unit,
    onRetryPin: () -> Unit,
    onBack: () -> Unit,
) {
    val primaryRequester = remember { FocusRequester() }
    LaunchedEffect(state.loginMode) {
        if (state.loginMode != LoginMode.Qr) primaryRequester.requestFocus()
    }

    Column {
        // Plex/Jellyfin switch — the Plex flow lands here directly (discovery-first), so without
        // this the Jellyfin option was unreachable.
        BackendChooser(selected = state.backend, onSelect = onBackendChange)
        Spacer(Modifier.height(16.dp))

        // Plex starts at Login (discovery-first) so there's no server step to go
        // back to; Jellyfin still has one.
        if (state.backend == dev.butu.data.config.ServerType.Jellyfin) {
            BackToServer(serverUrl = state.serverUrl, onBack = onBack)
            Spacer(Modifier.height(20.dp))
        }

        ModeTabs(backend = state.backend, active = state.loginMode, onSelect = onModeChange)
        Spacer(Modifier.height(20.dp))

        AnimatedContent(
            targetState = state.loginMode,
            transitionSpec = {
                (fadeIn(tween(200)) + slideInVertically(tween(200)) { 8 })
                    .togetherWith(fadeOut(tween(150)))
            },
            label = "login-mode",
        ) { mode ->
            when (mode) {
                LoginMode.Qr -> QrLoginPanel(
                    state = state,
                    onRetry = onRetryPin,
                )
                LoginMode.Password -> Column {
                    StepHeading(
                        title = "Sign in",
                        subtitle = "Use your plex.tv username and password",
                    )
                    Spacer(Modifier.height(24.dp))

                    SetupTextField(
                        value = state.username,
                        onValueChange = onUsername,
                        placeholder = "Username or email",
                        imeAction = ImeAction.Next,
                        modifier = Modifier.focusRequester(primaryRequester),
                    )
                    Spacer(Modifier.height(12.dp))

                    SetupTextField(
                        value = state.password,
                        onValueChange = onPassword,
                        placeholder = "Password",
                        isPassword = true,
                        imeAction = ImeAction.Go,
                        onImeAction = onSignIn,
                    )
                    Spacer(Modifier.height(20.dp))

                    GradientButton(
                        label = if (state.loading) "Signing in…" else "Sign in",
                        loading = state.loading,
                        onClick = onSignIn,
                    )
                }
                LoginMode.Token -> Column {
                    StepHeading(
                        title = "Paste token",
                        subtitle = "Use your existing X-Plex-Token",
                    )
                    Spacer(Modifier.height(24.dp))

                    SetupTextField(
                        value = state.token,
                        onValueChange = onToken,
                        placeholder = "X-Plex-Token value",
                        imeAction = ImeAction.Go,
                        onImeAction = onSignInWithToken,
                        modifier = Modifier.focusRequester(primaryRequester),
                    )
                    Spacer(Modifier.height(20.dp))

                    GradientButton(
                        label = if (state.loading) "Verifying…" else "Connect →",
                        loading = state.loading,
                        onClick = onSignInWithToken,
                    )
                }
            }
        }
    }
}

@Composable
private fun ModeTabs(
    backend: dev.butu.data.config.ServerType,
    active: LoginMode,
    onSelect: (LoginMode) -> Unit,
) {
    val qrLabel = if (backend == dev.butu.data.config.ServerType.Plex) "QR Code" else "Quick Connect"
    Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        ModeTab(label = qrLabel,    active = active == LoginMode.Qr,       onClick = { onSelect(LoginMode.Qr) }, modifier = Modifier.weight(1f))
        ModeTab(label = "Password", active = active == LoginMode.Password, onClick = { onSelect(LoginMode.Password) }, modifier = Modifier.weight(1f))
        if (backend == dev.butu.data.config.ServerType.Plex) {
            ModeTab(label = "Token", active = active == LoginMode.Token,   onClick = { onSelect(LoginMode.Token) }, modifier = Modifier.weight(1f))
        }
    }
}

@Composable
private fun ModeTab(
    label: String,
    active: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier,
) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val highlight = active || focused

    Box(
        modifier = modifier
            .background(
                color = if (highlight) ButuColors.NeonAura.copy(alpha = if (active) 0.16f else 0.10f)
                        else Color.White.copy(alpha = 0.04f),
                shape = RoundedCornerShape(12.dp),
            )
            .border(
                width = if (focused) 2.dp else 1.dp,
                color = when {
                    focused -> ButuColors.NeonAura.copy(alpha = 0.85f)
                    active  -> ButuColors.NeonAura.copy(alpha = 0.45f)
                    else    -> Color.White.copy(alpha = 0.08f)
                },
                shape = RoundedCornerShape(12.dp),
            )
            .clickable(interactionSource = source, indication = null, onClick = onClick)
            .padding(vertical = 10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (highlight) ButuColors.NeonAura else Color.White.copy(alpha = 0.55f),
            style = ButuType.LabelLg.copy(
                fontWeight = if (active) FontWeight.Bold else FontWeight.Medium,
                fontSize = 12.sp,
            ),
        )
    }
}

@Composable
private fun QrLoginPanel(
    state: SetupUiState,
    onRetry: () -> Unit,
) {
    val isPlex = state.backend == dev.butu.data.config.ServerType.Plex
    val title = if (isPlex) "Scan to sign in" else "Quick Connect"
    val subtitle = if (isPlex)
        "Open the camera on your phone, then enter the code on plex.tv/link"
    else
        "Open Jellyfin on a signed-in device → Profile → Quick Connect, then type the code below"

    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        StepHeading(title = title, subtitle = subtitle)
        Spacer(Modifier.height(16.dp))

        when {
            state.error != null && state.pin == null -> {
                ErrorWithRetry(message = state.error, onRetry = onRetry)
            }
            state.pin != null -> {
                state.pin.authUrl?.let {
                    QrTile(authUrl = it)
                    Spacer(Modifier.height(14.dp))
                }
                CodeBadge(code = state.pin.code)
                Spacer(Modifier.height(12.dp))
                Text(
                    text = if (state.loading) "Linking…" else "Waiting for sign-in…",
                    color = ButuColors.NeonAura.copy(alpha = 0.85f),
                    style = ButuType.LabelMd.copy(fontSize = 12.sp),
                )
            }
            else -> {
                Text(
                    text = "Generating code…",
                    color = ButuColors.OnSurfaceVariant,
                    style = ButuType.BodyMd.copy(fontSize = 14.sp),
                )
            }
        }
    }
}

@Composable
private fun QrTile(authUrl: String) {
    val image = remember(authUrl) { dev.butu.util.encodeQrCode(authUrl, size = 480) }
    Box(
        modifier = Modifier
            .size(156.dp)
            .background(Color.White, RoundedCornerShape(14.dp))
            .border(1.dp, ButuColors.NeonAura.copy(alpha = 0.30f), RoundedCornerShape(14.dp))
            .padding(10.dp),
        contentAlignment = Alignment.Center,
    ) {
        Image(
            bitmap = image,
            contentDescription = "Plex sign-in QR code",
            modifier = Modifier.fillMaxSize(),
        )
    }
}

@Composable
private fun CodeBadge(code: String) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(10.dp),
    ) {
        Text(
            text = "CODE",
            color = ButuColors.OnSurfaceVariant,
            style = ButuType.LabelMd.copy(fontSize = 11.sp),
        )
        Text(
            text = code,
            color = ButuColors.NeonAura,
            style = ButuType.HeadlineSm.copy(
                fontFamily = ButuFonts.Mono,
                fontWeight = FontWeight.Black,
                fontSize = 26.sp,
                letterSpacing = 0.25.em,
            ),
        )
    }
}

@Composable
private fun ErrorWithRetry(message: String, onRetry: () -> Unit) {
    Column(horizontalAlignment = Alignment.CenterHorizontally) {
        Text(
            text = message,
            color = Color(0xFFFF6B6B),
            style = ButuType.BodyMd.copy(fontSize = 14.sp),
        )
        Spacer(Modifier.height(16.dp))
        GradientButton(label = "Try again", loading = false, onClick = onRetry)
    }
}

@Composable
private fun BackToServer(serverUrl: String, onBack: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(6.dp),
        modifier = Modifier.clickable(interactionSource = source, indication = null, onClick = onBack),
    ) {
        Icon(
            imageVector = Icons.AutoMirrored.Filled.KeyboardArrowLeft,
            contentDescription = null,
            tint = if (focused) Color.White else Color.White.copy(alpha = 0.45f),
            modifier = Modifier.size(14.dp),
        )
        Text(
            text = serverUrl.removePrefix("http://").removePrefix("https://"),
            color = if (focused) Color.White else Color.White.copy(alpha = 0.45f),
            style = ButuType.BodyMd.copy(fontSize = 14.sp),
        )
    }
}

@Composable
private fun StepHeading(title: String, subtitle: String) {
    Text(
        text = title,
        color = ButuColors.OnSurface,
        style = ButuType.HeadlineSm.copy(fontWeight = FontWeight.Bold, fontSize = 18.sp),
    )
    Spacer(Modifier.height(4.dp))
    Text(
        text = subtitle,
        color = ButuColors.OnSurfaceVariant,
        style = ButuType.BodyMd.copy(fontSize = 14.sp),
    )
}

@Composable
private fun SetupTextField(
    value: String,
    onValueChange: (String) -> Unit,
    placeholder: String,
    modifier: Modifier = Modifier,
    isPassword: Boolean = false,
    keyboardType: KeyboardType = KeyboardType.Text,
    imeAction: ImeAction = ImeAction.Default,
    onImeAction: () -> Unit = {},
) {
    OutlinedTextField(
        value = value,
        onValueChange = onValueChange,
        placeholder = {
            androidx.compose.material3.Text(
                text = placeholder,
                color = Color.White.copy(alpha = 0.30f),
                style = ButuType.LabelMd.copy(fontSize = 14.sp, fontFamily = ButuFonts.Mono),
            )
        },
        singleLine = true,
        textStyle = ButuType.LabelMd.copy(
            fontSize = 14.sp,
            fontFamily = ButuFonts.Mono,
            color = ButuColors.OnSurface,
        ),
        visualTransformation = if (isPassword) PasswordVisualTransformation() else androidx.compose.ui.text.input.VisualTransformation.None,
        keyboardOptions = KeyboardOptions(
            keyboardType = if (isPassword) KeyboardType.Password else keyboardType,
            imeAction = imeAction,
        ),
        keyboardActions = KeyboardActions(
            onGo = { onImeAction() },
            onDone = { onImeAction() },
            onNext = { onImeAction() },
        ),
        shape = RoundedCornerShape(16.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = Color(0xCC161A26),
            unfocusedContainerColor = Color(0xCC161A26),
            focusedBorderColor = ButuColors.NeonAura.copy(alpha = 0.55f),
            unfocusedBorderColor = ButuColors.NeonAura.copy(alpha = 0.12f),
            cursorColor = ButuColors.NeonAura,
            focusedTextColor = ButuColors.OnSurface,
            unfocusedTextColor = ButuColors.OnSurface,
        ),
        modifier = modifier.fillMaxWidth(),
    )
}

@Composable
private fun GradientButton(label: String, loading: Boolean, onClick: () -> Unit) {
    val source = remember { MutableInteractionSource() }
    val focused by source.collectIsFocusedAsState()
    val scale by androidx.compose.animation.core.animateFloatAsState(
        targetValue = if (focused && !loading) 1.02f else 1f,
        animationSpec = tween(150),
        label = "btn-scale",
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .scale(scale)
            .shadow(
                elevation = if (focused) 16.dp else 0.dp,
                shape = RoundedCornerShape(16.dp),
                ambientColor = ButuColors.NeonAura,
                spotColor = ButuColors.NeonAura,
                clip = false,
            )
            .background(
                brush = if (loading)
                    Brush.linearGradient(listOf(
                        ButuColors.NeonAura.copy(alpha = 0.15f),
                        ButuColors.NeonAura.copy(alpha = 0.15f),
                    ))
                else
                    Brush.linearGradient(listOf(ButuColors.NeonAura, ButuColors.PrimaryContainer)),
                shape = RoundedCornerShape(16.dp),
            )
            .clickable(
                interactionSource = source,
                indication = null,
                enabled = !loading,
                onClick = onClick,
            )
            .padding(vertical = 16.dp),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = if (loading) ButuColors.NeonAura else ButuColors.OnPrimary,
            style = ButuType.HeadlineSm.copy(
                fontWeight = FontWeight.Bold,
                fontSize = 16.sp,
            ),
        )
    }
}

private fun AnimatedContentTransitionScope<SetupStep>.stepTransition(
    target: SetupStep,
    initial: SetupStep,
) = if (target.ordinal > initial.ordinal) {
    (slideInVertically(tween(250)) { 16 } + fadeIn(tween(250)))
        .togetherWith(fadeOut(tween(250)))
} else {
    (slideInVertically(tween(250)) { -16 } + fadeIn(tween(250)))
        .togetherWith(fadeOut(tween(250)))
}
