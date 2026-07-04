package dev.butu.feature.remote

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBarsPadding
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import dev.butu.ui.theme.ButuColors
import dev.butu.ui.theme.ButuType

// A drag across the pad moves the cursor 1.5× that fraction of the screen.
private const val TOUCH_SENS = 1.5

/**
 * Phone-as-remote controller. Enter the TV's LAN IP, connect, then aim the phone
 * (gyro) or drag the touchpad to move the cursor, with Select / Back / Scroll
 * below. All input goes straight to ws://<tv-ip>:9001 — see [RemoteClient].
 */
@Composable
fun RemoteScreen(
    onClose: () -> Unit,
    viewModel: RemoteViewModel = hiltViewModel(),
) {
    val state by viewModel.uiState.collectAsStateWithLifecycle()
    val discovered by viewModel.discoveredHosts.collectAsStateWithLifecycle()
    val connected = state.connection is RemoteConnectionState.Connected

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(ButuColors.SurfaceLowest)
            .systemBarsPadding()
            .padding(horizontal = 20.dp, vertical = 12.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
    ) {
        // ── Header ────────────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            TextButton(onClick = onClose) {
                Text("‹ Back", color = ButuColors.OnSurfaceVariant)
            }
            Text(
                text = "Air Mouse",
                color = ButuColors.OnSurface,
                style = ButuType.HeadlineSm.copy(fontSize = 18.sp, fontWeight = FontWeight.Bold),
            )
            // Balance the back button so the title stays centred.
            Spacer(Modifier.size(64.dp, 1.dp))
        }

        StatusPill(state.connection)

        Spacer(Modifier.height(12.dp))

        // ── Nearby TVs (auto-discovered via mDNS) ────────────────
        if (!connected) {
            Text(
                text = if (discovered.isEmpty()) "SEARCHING FOR TVs…" else "NEARBY",
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 10.sp),
                modifier = Modifier.fillMaxWidth(),
            )
            Spacer(Modifier.height(6.dp))
            discovered.forEach { tv ->
                DiscoveredRow(tv) { viewModel.connectTo(tv.host) }
                Spacer(Modifier.height(6.dp))
            }
            Spacer(Modifier.height(6.dp))
        }

        // ── Or enter IP manually ─────────────────────────────────
        OutlinedTextField(
            value = state.host,
            onValueChange = viewModel::setHost,
            singleLine = true,
            enabled = !connected,
            label = { Text("Or enter TV IP manually") },
            placeholder = { Text("192.168.1.x") },
            modifier = Modifier.fillMaxWidth(),
            colors = OutlinedTextFieldDefaults.colors(
                focusedTextColor = ButuColors.OnSurface,
                unfocusedTextColor = ButuColors.OnSurface,
                disabledTextColor = ButuColors.OnSurfaceVariant,
                focusedBorderColor = ButuColors.Primary,
                unfocusedBorderColor = ButuColors.OutlineVariant,
                cursorColor = ButuColors.Primary,
                focusedLabelColor = ButuColors.Primary,
                unfocusedLabelColor = ButuColors.OnSurfaceVariant,
            ),
        )

        Spacer(Modifier.height(10.dp))

        Button(
            onClick = { if (connected) viewModel.disconnect() else viewModel.connect() },
            enabled = connected || state.host.isNotBlank(),
            modifier = Modifier.fillMaxWidth().height(50.dp),
            shape = RoundedCornerShape(14.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = if (connected) ButuColors.SurfaceContainerHigh else ButuColors.Primary,
                contentColor = if (connected) ButuColors.OnSurface else ButuColors.OnPrimary,
            ),
        ) {
            Text(if (connected) "DISCONNECT" else "CONNECT", fontWeight = FontWeight.Bold)
        }

        Spacer(Modifier.height(14.dp))

        // ── Mode toggle ──────────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            ModeChip(
                label = "Gyroscope",
                selected = state.mode == RemoteMode.Gyro,
                enabled = state.gyroAvailable,
                modifier = Modifier.weight(1f),
                onClick = { viewModel.setMode(RemoteMode.Gyro) },
            )
            ModeChip(
                label = "Touchpad",
                selected = state.mode == RemoteMode.Touch,
                enabled = true,
                modifier = Modifier.weight(1f),
                onClick = { viewModel.setMode(RemoteMode.Touch) },
            )
        }

        // ── Aim surface (fills the middle) ───────────────────────
        Box(
            modifier = Modifier
                .fillMaxWidth()
                .weight(1f)
                .padding(vertical = 14.dp)
                .background(ButuColors.SurfaceContainer.copy(alpha = 0.55f), RoundedCornerShape(24.dp))
                .border(1.dp, ButuColors.NeonGlow12, RoundedCornerShape(24.dp))
                .then(
                    if (state.mode == RemoteMode.Touch) {
                        Modifier.pointerInput(connected) {
                            if (!connected) return@pointerInput
                            detectDragGestures { change, dragAmount ->
                                change.consume()
                                viewModel.onTouchpadDrag(
                                    (dragAmount.x / size.width) * TOUCH_SENS,
                                    (dragAmount.y / size.height) * TOUCH_SENS,
                                )
                            }
                        }
                    } else Modifier,
                ),
            contentAlignment = Alignment.Center,
        ) {
            Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Box(
                    modifier = Modifier
                        .size(56.dp)
                        .border(1.5.dp, ButuColors.NeonGlow20, CircleShape),
                    contentAlignment = Alignment.Center,
                ) {
                    Box(
                        modifier = Modifier
                            .size(12.dp)
                            .background(ButuColors.Primary, CircleShape),
                    )
                }
                Spacer(Modifier.height(12.dp))
                Text(
                    text = when {
                        state.mode == RemoteMode.Gyro -> "Point at the screen and tilt to aim"
                        connected -> "Drag anywhere to move the cursor"
                        else -> "Connect to start"
                    },
                    color = ButuColors.OnSurfaceVariant,
                    textAlign = TextAlign.Center,
                    style = ButuType.BodyMd.copy(fontSize = 13.sp),
                )
                if (state.mode == RemoteMode.Gyro) {
                    Spacer(Modifier.height(14.dp))
                    TextButton(onClick = viewModel::recenter, enabled = connected) {
                        Text("Recenter", color = ButuColors.Primary)
                    }
                }
            }
        }

        // ── Control buttons ──────────────────────────────────────
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ControlButton("SELECT", Modifier.weight(1f), primary = true, enabled = connected, onClick = viewModel::click)
            ControlButton("BACK", Modifier.weight(1f), primary = false, enabled = connected, onClick = viewModel::back)
        }
        Spacer(Modifier.height(10.dp))
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp),
        ) {
            ControlButton("SCROLL ▲", Modifier.weight(1f), primary = false, enabled = connected, onClick = viewModel::scrollUp)
            ControlButton("SCROLL ▼", Modifier.weight(1f), primary = false, enabled = connected, onClick = viewModel::scrollDown)
        }
    }
}

@Composable
private fun DiscoveredRow(tv: DiscoveredHost, onClick: () -> Unit) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .background(ButuColors.SurfaceContainer.copy(alpha = 0.5f), RoundedCornerShape(12.dp))
            .border(1.dp, ButuColors.Primary.copy(alpha = 0.18f), RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.SpaceBetween,
    ) {
        Column {
            Text(
                text = tv.name,
                color = ButuColors.OnSurface,
                style = ButuType.BodyMd.copy(fontSize = 14.sp, fontWeight = FontWeight.SemiBold),
            )
            Text(
                text = tv.host,
                color = ButuColors.OnSurfaceVariant,
                style = ButuType.LabelMd.copy(fontSize = 11.sp),
            )
        }
        Text(
            text = "CONNECT",
            color = ButuColors.Primary,
            style = ButuType.LabelMd.copy(fontSize = 11.sp, fontWeight = FontWeight.Bold),
        )
    }
}

@Composable
private fun StatusPill(connection: RemoteConnectionState) {
    val (label, color) = when (connection) {
        RemoteConnectionState.Connected -> "CONNECTED · AIR MOUSE ACTIVE" to ButuColors.Primary
        RemoteConnectionState.Connecting -> "CONNECTING…" to ButuColors.OnSurfaceVariant
        RemoteConnectionState.Disconnected -> "DISCONNECTED" to ButuColors.OnSurfaceVariant
        is RemoteConnectionState.Error -> "ERROR · ${connection.message}" to Color(0xFFFF6B6B)
    }
    Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(6.dp)) {
        Box(modifier = Modifier.size(8.dp).background(color, CircleShape))
        Text(label, color = color, style = ButuType.LabelMd.copy(fontSize = 11.sp))
    }
}

@Composable
private fun ModeChip(
    label: String,
    selected: Boolean,
    enabled: Boolean,
    modifier: Modifier = Modifier,
    onClick: () -> Unit,
) {
    Box(
        modifier = modifier
            .height(40.dp)
            .background(
                if (selected) ButuColors.NeonGlow12 else ButuColors.SurfaceContainer.copy(alpha = 0.5f),
                RoundedCornerShape(12.dp),
            )
            .border(
                1.dp,
                if (selected) ButuColors.Primary.copy(alpha = 0.35f) else Color.Transparent,
                RoundedCornerShape(12.dp),
            )
            .clickable(enabled = enabled, onClick = onClick),
        contentAlignment = Alignment.Center,
    ) {
        Text(
            text = label,
            color = when {
                !enabled -> ButuColors.OnSurfaceVariant.copy(alpha = 0.4f)
                selected -> ButuColors.Primary
                else -> ButuColors.OnSurfaceVariant
            },
            style = ButuType.LabelMd.copy(fontSize = 12.sp, fontWeight = FontWeight.SemiBold),
        )
    }
}

@Composable
private fun ControlButton(
    label: String,
    modifier: Modifier = Modifier,
    primary: Boolean,
    enabled: Boolean,
    onClick: () -> Unit,
) {
    Button(
        onClick = onClick,
        enabled = enabled,
        modifier = modifier.height(56.dp),
        shape = RoundedCornerShape(14.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = if (primary) ButuColors.Primary else ButuColors.SurfaceContainerHigh,
            contentColor = if (primary) ButuColors.OnPrimary else ButuColors.OnSurface,
            disabledContainerColor = ButuColors.SurfaceContainer.copy(alpha = 0.4f),
            disabledContentColor = ButuColors.OnSurfaceVariant.copy(alpha = 0.4f),
        ),
    ) {
        Text(label, fontWeight = FontWeight.Bold, fontSize = 13.sp)
    }
}
