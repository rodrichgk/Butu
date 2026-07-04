package dev.butu.feature.remote

import android.content.Context
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject

/**
 * Reads the fused game-rotation-vector sensor and converts device attitude into
 * the same beta/gamma degrees the browser DeviceOrientationEvent produced, so the
 * existing host smoother (spatial_bridge.rs / AirMouseService) maps them to the
 * cursor with no changes.
 *
 * Motion sensors need no runtime permission — that's the whole point of going
 * native: the browser gyro path required a secure (HTTPS) context, this doesn't.
 *
 * Host mapping it feeds (see ImuSmoother): gamma ≈ 0 & beta ≈ 45 → screen centre,
 * each axis spanning ±45°. We recentre on start so any comfortable grip is neutral.
 */
class OrientationSensor @Inject constructor(
    @ApplicationContext context: Context,
) : SensorEventListener {

    private val sensorManager = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    private val rotationSensor: Sensor? =
        sensorManager.getDefaultSensor(Sensor.TYPE_GAME_ROTATION_VECTOR)
            ?: sensorManager.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR)

    val isAvailable: Boolean get() = rotationSensor != null

    private var onSample: ((beta: Double, gamma: Double) -> Unit)? = null

    private var pitchCenter = 0.0
    private var rollCenter = 0.0
    private var lastPitch = 0.0
    private var lastRoll = 0.0

    private val rotationMatrix = FloatArray(9)
    private val remapped = FloatArray(9)
    private val orientation = FloatArray(3)

    fun start(onSample: (beta: Double, gamma: Double) -> Unit) {
        this.onSample = onSample
        rotationSensor?.let {
            sensorManager.registerListener(this, it, SensorManager.SENSOR_DELAY_GAME)
        }
    }

    fun stop() {
        sensorManager.unregisterListener(this)
        onSample = null
    }

    /** Capture the current attitude as the neutral centre (cursor middle). */
    fun recenter() {
        pitchCenter = lastPitch
        rollCenter = lastRoll
    }

    override fun onSensorChanged(event: SensorEvent) {
        SensorManager.getRotationMatrixFromVector(rotationMatrix, event.values)
        // Remap for a phone held upright in portrait, top edge pointed at the screen,
        // so pitch = up/down aim and roll = left/right aim.
        SensorManager.remapCoordinateSystem(
            rotationMatrix,
            SensorManager.AXIS_X,
            SensorManager.AXIS_Z,
            remapped,
        )
        SensorManager.getOrientation(remapped, orientation)
        val pitch = Math.toDegrees(orientation[1].toDouble())
        val roll = Math.toDegrees(orientation[2].toDouble())
        lastPitch = pitch
        lastRoll = roll

        val gamma = (roll - rollCenter) * SENSITIVITY
        val beta = NEUTRAL_BETA - (pitch - pitchCenter) * SENSITIVITY
        onSample?.invoke(beta, gamma)
    }

    override fun onAccuracyChanged(sensor: Sensor?, accuracy: Int) {}

    private companion object {
        // Host reads beta≈45 / gamma≈0 as screen centre.
        const val NEUTRAL_BETA = 45.0
        // Amplifies a comfortable wrist tilt so a small motion crosses the screen.
        // Tune (or flip a sign above) on-device if aim feels off.
        const val SENSITIVITY = 1.6
    }
}
