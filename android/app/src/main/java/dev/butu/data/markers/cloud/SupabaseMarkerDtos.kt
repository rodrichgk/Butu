package dev.butu.data.markers.cloud

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/** A single marker row as returned by `?select=marker_type,start_ms,end_ms`. */
@Serializable
data class SupabaseMarkerDto(
    @SerialName("marker_type") val markerType: String,   // "intro" | "credits"
    @SerialName("start_ms")    val startMs: Long,
    @SerialName("end_ms")      val endMs: Long,
)
