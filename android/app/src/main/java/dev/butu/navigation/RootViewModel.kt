package dev.butu.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import dev.butu.data.media.MediaRepository
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import javax.inject.Inject

/**
 * Tiny router-VM. Owns the only piece of state the NavHost needs: whether the
 * user has finished setup. Splash uses this to decide whether to route to Home
 * or Setup once its animation completes — and waits on [isReady] so the user
 * doesn't land on an empty home with a "Loading…" banner.
 */
@HiltViewModel
class RootViewModel @Inject constructor(
    mediaRepository: MediaRepository,
) : ViewModel() {

    val isConfigured: StateFlow<Boolean?> = mediaRepository.isConfigured
        .stateIn(viewModelScope, SharingStarted.Eagerly, initialValue = null)

    /** True after the very first library refresh attempt finishes (success or failure). */
    private val librarySettled = MutableStateFlow(false)

    /** True once we know what to show: setup screen, or home with a populated library. */
    val isReady: StateFlow<Boolean> = combine(
        mediaRepository.isConfigured,
        mediaRepository.library,
        librarySettled,
    ) { configured, library, settled ->
        when {
            configured == false  -> true                  // Setup screen renders fine empty.
            library.isNotEmpty() -> true                  // Library populated.
            settled              -> true                  // Refresh finished, even if empty.
            else                 -> false
        }
    }.stateIn(viewModelScope, SharingStarted.Eagerly, initialValue = false)

    init {
        // Kick the library load now so by the time the splash finishes the home screen
        // already has data — no more "Loading library…" flash on app start.
        viewModelScope.launch {
            val configured = mediaRepository.isConfigured.first()
            if (configured) {
                mediaRepository.refreshLibrary()
            }
            librarySettled.value = true
        }
    }
}
