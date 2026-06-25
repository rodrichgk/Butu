package dev.butu.feature.airmouse

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import dev.butu.data.config.ConfigStore
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AirMouseViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val configStore: ConfigStore,
    repository: AirMouseRepository,
) : ViewModel() {

    val state: StateFlow<AirMouseState> = repository.state
    val commands: SharedFlow<AirMouseCommand> = repository.commands

    init {
        viewModelScope.launch {
            configStore.airMouseEnabled.collect { enabled ->
                if (enabled) {
                    ContextCompat.startForegroundService(context, AirMouseService.startIntent(context))
                } else {
                    val stopIntent = Intent(context, AirMouseService::class.java).apply {
                        action = AirMouseService.ACTION_STOP
                    }
                    context.startService(stopIntent)
                }
            }
        }
    }
}
