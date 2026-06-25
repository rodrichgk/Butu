package dev.butu.util

import android.content.Context
import android.util.Log
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object DebugLogger {
    private const val TAG = "ButuDebug"
    private const val FILE_NAME = "butu_debug_log.txt"

    fun log(context: Context, message: String) {
        val timestamp = SimpleDateFormat("yyyy-MM-dd HH:mm:ss.SSS", Locale.US).format(Date())
        val logLine = "[$timestamp] $message"
        
        // Log to logcat
        Log.d(TAG, message)
        
        // Log to file
        try {
            val file = File(context.filesDir, FILE_NAME)
            file.appendText(logLine + "\n")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to write log to file", e)
        }
    }

    fun getLogFile(context: Context): File {
        return File(context.filesDir, FILE_NAME)
    }

    fun readLogs(context: Context): String {
        return try {
            val file = File(context.filesDir, FILE_NAME)
            if (file.exists()) file.readText() else "Log file does not exist."
        } catch (e: Exception) {
            "Failed to read logs: ${e.message}"
        }
    }

    fun clearLogs(context: Context) {
        try {
            val file = File(context.filesDir, FILE_NAME)
            if (file.exists()) {
                file.delete()
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to clear logs", e)
        }
    }
}
