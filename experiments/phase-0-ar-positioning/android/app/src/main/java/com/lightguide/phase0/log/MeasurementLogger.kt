package com.lightguide.phase0.log

import android.content.Context
import android.os.Build
import com.lightguide.phase0.pose.FrameMode
import com.lightguide.phase0.pose.M_TO_CM
import com.lightguide.phase0.pose.MarkerSizes
import com.lightguide.phase0.pose.Reading
import com.lightguide.phase0.pose.Tolerances
import org.json.JSONArray
import org.json.JSONObject
import java.io.File
import java.io.FileWriter
import java.io.IOException
import java.io.Writer
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone

/**
 * Collects timestamped readings for later comparison against independent
 * ground truth, and writes them out as CSV and JSON.
 *
 * Recording is explicitly armed by the user rather than always-on, so a log
 * contains deliberate trials instead of every second the app was open. Trial
 * marks let the operator delimit the repositioning attempts they are timing
 * with a tape measure, which is how the log lines up with ground truth later.
 */
class MeasurementLogger(private val context: Context) {

    enum class EventType { SAMPLE, TRIAL_MARK, NOTE, TARGET_SAVED, TARGET_CLEARED, SESSION_START }

    data class Row(
        val event: EventType,
        val timestampMs: Long,
        val trial: Int,
        val frameMode: FrameMode?,
        val trackingState: String,
        val referenceAgeMs: Long?,
        val cameraDistanceCm: Float?,
        val xCm: Float?, val yCm: Float?, val zCm: Float?,
        val pitchDeg: Float?, val yawDeg: Float?, val rollDeg: Float?,
        val dxCm: Float?, val dyCm: Float?, val dzCm: Float?,
        val dPitchDeg: Float?, val dYawDeg: Float?, val dRollDeg: Float?,
        val positionErrorCm: Float?,
        val orientationErrorDeg: Float?,
        val inPositionTolerance: Boolean?,
        val inOrientationTolerance: Boolean?,
        val note: String,
    )

    val sessionId: String = SESSION_ID_FORMAT.format(Date())

    private val rows = ArrayList<Row>()
    private var trial = 0

    /** Directory shared by the live file and the exports. */
    private val logDir: File
        get() = File(context.getExternalFilesDir(null), "logs").apply { mkdirs() }

    /**
     * Written continuously during the session. Deliberately the same path the
     * CSV export writes, so EXPORT simply rewrites a complete copy over it and
     * there is only ever one CSV per session to collect.
     */
    private val liveFile: File get() = File(logDir, "phase0_$sessionId.csv")

    private var liveWriter: Writer? = null

    /** First live-write failure, surfaced in the status line. Null while healthy. */
    @Volatile
    var liveWriteError: String? = null
        private set

    var recording: Boolean = false
        private set

    val rowCount: Int get() = synchronized(rows) { rows.size }
    val trialCount: Int get() = trial

    fun setRecording(on: Boolean) {
        recording = on
    }

    /** Records an operator-visible event regardless of the recording toggle. */
    fun logEvent(type: EventType, note: String, reading: Reading?, tolerances: Tolerances) {
        append(buildRow(type, reading, tolerances, note))
    }

    /** Records a live reading, but only while recording is armed. */
    fun logSample(reading: Reading?, trackingState: String, tolerances: Tolerances) {
        if (!recording) return
        append(buildRow(EventType.SAMPLE, reading, tolerances, "", trackingState))
    }

    fun markTrial(reading: Reading?, tolerances: Tolerances, note: String): Int {
        trial += 1
        val text = if (note.isBlank()) "trial $trial start" else "trial $trial start | $note"
        append(buildRow(EventType.TRIAL_MARK, reading, tolerances, text))
        return trial
    }

    fun clear() {
        synchronized(rows) { rows.clear() }
        trial = 0
    }

    /** Absolute path of the live CSV, for the status line and adb pull. */
    val livePath: String get() = liveFile.absolutePath

    @Synchronized private fun append(row: Row) {
        synchronized(rows) {
            if (rows.size >= MAX_ROWS) return
            rows.add(row)
        }
        appendToDisk(row)
    }

    /**
     * Streams every row to the session CSV as it happens.
     *
     * Rows used to live only in memory until EXPORT, so an Android kill or a
     * crash lost the whole session - a real risk after an hour of trials that
     * cannot be repeated. The live file is the same format as the export, so a
     * killed session is still fully analysable.
     *
     * A failure here must never take down a trial in progress, so it is
     * recorded once and then swallowed; the in-memory rows and EXPORT remain
     * as the backstop.
     */
    @Synchronized private fun appendToDisk(row: Row) {
        try {
            val writer = liveWriter ?: openLiveWriter() ?: return
            writer.write(toCsv(row))
            writer.write("\n")
            writer.flush()
        } catch (e: IOException) {
            if (liveWriteError == null) {
                liveWriteError = "${e.javaClass.simpleName}: ${e.message}"
            }
        }
    }

    private fun openLiveWriter(): Writer? = try {
        val fresh = !liveFile.exists() || liveFile.length() == 0L
        liveFile.parentFile?.mkdirs()
        FileWriter(liveFile, true).also {
            if (fresh) {
                it.write(CSV_HEADER)
                it.write("\n")
                it.flush()
            }
            liveWriter = it
        }
    } catch (e: IOException) {
        liveWriteError = "${e.javaClass.simpleName}: ${e.message}"
        null
    }

    /** Flushes and closes the live file; safe to call more than once. */
    @Synchronized fun close() {
        try {
            liveWriter?.flush()
            liveWriter?.close()
        } catch (_: IOException) {
            // Nothing useful to do while shutting down.
        }
        liveWriter = null
    }

    private fun buildRow(
        type: EventType,
        reading: Reading?,
        tolerances: Tolerances,
        note: String,
        trackingState: String = if (reading != null) "TRACKING" else "NONE",
    ): Row {
        val delta = reading?.delta
        return Row(
            event = type,
            timestampMs = reading?.timestampMs ?: System.currentTimeMillis(),
            trial = trial,
            frameMode = reading?.frameMode,
            trackingState = trackingState,
            referenceAgeMs = reading?.referenceAgeMs,
            cameraDistanceCm = reading?.cameraDistanceM?.times(M_TO_CM),
            xCm = reading?.standPose?.position?.x?.times(M_TO_CM),
            yCm = reading?.standPose?.position?.y?.times(M_TO_CM),
            zCm = reading?.standPose?.position?.z?.times(M_TO_CM),
            pitchDeg = reading?.standPose?.euler?.pitchDeg,
            yawDeg = reading?.standPose?.euler?.yawDeg,
            rollDeg = reading?.standPose?.euler?.rollDeg,
            dxCm = delta?.translation?.x?.times(M_TO_CM),
            dyCm = delta?.translation?.y?.times(M_TO_CM),
            dzCm = delta?.translation?.z?.times(M_TO_CM),
            dPitchDeg = delta?.rotation?.pitchDeg,
            dYawDeg = delta?.rotation?.yawDeg,
            dRollDeg = delta?.rotation?.rollDeg,
            positionErrorCm = delta?.positionErrorCm,
            orientationErrorDeg = delta?.orientationErrorDeg,
            inPositionTolerance = delta?.let { it.positionErrorCm <= tolerances.positionCm },
            inOrientationTolerance = delta?.let { it.orientationErrorDeg <= tolerances.orientationDeg },
            note = note,
        )
    }

    // ------------------------------------------------------------- export --

    data class Export(val csv: File, val json: File, val rowCount: Int)

    /**
     * Writes both formats into the app's external files dir, which is readable
     * over `adb pull` and shareable without any storage permission.
     */
    @Synchronized fun export(tolerances: Tolerances, markerSizes: MarkerSizes): Export {
        close()
        val snapshot = synchronized(rows) { ArrayList(rows) }
        val dir = File(context.getExternalFilesDir(null), "logs").apply { mkdirs() }

        val csv = File(dir, "phase0_$sessionId.csv")
        csv.writeText(buildString {
            append(CSV_HEADER).append('\n')
            for (r in snapshot) append(toCsv(r)).append('\n')
        })

        val json = File(dir, "phase0_$sessionId.json")
        json.writeText(buildJson(snapshot, tolerances, markerSizes).toString(2))

        return Export(csv, json, snapshot.size)
    }

    private fun toCsv(r: Row): String {
        val f = { v: Float? -> v?.let { String.format(Locale.US, "%.3f", it) } ?: "" }
        val b = { v: Boolean? -> v?.let { if (it) "1" else "0" } ?: "" }
        return listOf(
            ISO_FORMAT.format(Date(r.timestampMs)),
            r.timestampMs.toString(),
            sessionId,
            r.event.name,
            r.trial.toString(),
            r.frameMode?.name ?: "",
            r.trackingState,
            r.referenceAgeMs?.toString() ?: "",
            f(r.cameraDistanceCm),
            f(r.xCm), f(r.yCm), f(r.zCm),
            f(r.pitchDeg), f(r.yawDeg), f(r.rollDeg),
            f(r.dxCm), f(r.dyCm), f(r.dzCm),
            f(r.dPitchDeg), f(r.dYawDeg), f(r.dRollDeg),
            f(r.positionErrorCm), f(r.orientationErrorDeg),
            b(r.inPositionTolerance), b(r.inOrientationTolerance),
            escape(r.note),
        ).joinToString(",")
    }

    private fun escape(s: String): String {
        // Quote multiline cells and neutralise spreadsheet formula injection.
        val safe = if (s.trimStart().firstOrNull() in listOf('=', '+', '-', '@')) "'" + s else s
        return "\"" + safe.replace("\"", "\"\"") + "\""
    }

    private fun buildJson(
        snapshot: List<Row>,
        tolerances: Tolerances,
        markerSizes: MarkerSizes,
    ): JSONObject {
        val samples = JSONArray()
        for (r in snapshot) {
            samples.put(JSONObject().apply {
                put("timestampIso", ISO_FORMAT.format(Date(r.timestampMs)))
                put("timestampMs", r.timestampMs)
                put("event", r.event.name)
                put("trial", r.trial)
                putOpt("frameMode", r.frameMode?.name)
                put("trackingState", r.trackingState)
                putOpt("referenceAgeMs", r.referenceAgeMs)
                putOpt("cameraDistanceCm", r.cameraDistanceCm?.rounded())
                putOpt("xCm", r.xCm?.rounded())
                putOpt("yCm", r.yCm?.rounded())
                putOpt("zCm", r.zCm?.rounded())
                putOpt("pitchDeg", r.pitchDeg?.rounded())
                putOpt("yawDeg", r.yawDeg?.rounded())
                putOpt("rollDeg", r.rollDeg?.rounded())
                putOpt("dxCm", r.dxCm?.rounded())
                putOpt("dyCm", r.dyCm?.rounded())
                putOpt("dzCm", r.dzCm?.rounded())
                putOpt("dPitchDeg", r.dPitchDeg?.rounded())
                putOpt("dYawDeg", r.dYawDeg?.rounded())
                putOpt("dRollDeg", r.dRollDeg?.rounded())
                putOpt("positionErrorCm", r.positionErrorCm?.rounded())
                putOpt("orientationErrorDeg", r.orientationErrorDeg?.rounded())
                putOpt("inPositionTolerance", r.inPositionTolerance)
                putOpt("inOrientationTolerance", r.inOrientationTolerance)
                put("note", r.note)
            })
        }

        return JSONObject().apply {
            put("experiment", "phase-0-ar-positioning")
            put("sessionId", sessionId)
            put("exportedAtIso", ISO_FORMAT.format(Date()))
            put("device", JSONObject().apply {
                put("manufacturer", Build.MANUFACTURER)
                put("model", Build.MODEL)
                put("androidRelease", Build.VERSION.RELEASE)
                put("sdkInt", Build.VERSION.SDK_INT)
            })
            put("settings", JSONObject().apply {
                put("positionToleranceCm", tolerances.positionCm.rounded())
                put("orientationToleranceDeg", tolerances.orientationDeg.rounded())
                put("standMarkerWidthCm", (markerSizes.standWidthM * M_TO_CM).rounded())
                put("referenceMarkerWidthCm", (markerSizes.referenceWidthM * M_TO_CM).rounded())
            })
            put("units", JSONObject().apply {
                put("lengths", "centimetres throughout - x/y/z, deltas, camera distance and errors")
                put("position", "cm (x=right, y=up, z=forward, relative to frameMode origin)")
                put("cameraDistanceCm", "cm, phone camera to stand marker, frame-independent")
                put("orientation", "degrees (pitch up +, yaw right +, roll clockwise +)")
            })
            put("trials", trial)
            put("samples", samples)
        }
    }

    /**
     * Widens a Float to Double at a precision the measurement actually has.
     * A plain toDouble() exposes the float's binary tail (0.2f becomes
     * 0.20000000298023224), which is noise in a measurement log.
     */
    private fun Float.rounded(): Double = Math.round(toDouble() * 1e6) / 1e6

    private companion object {
        const val MAX_ROWS = 50_000

        const val CSV_HEADER =
            "timestamp_iso,timestamp_ms,session_id,event,trial,frame_mode,tracking_state," +
                "reference_age_ms,camera_distance_cm,x_cm,y_cm,z_cm,pitch_deg,yaw_deg,roll_deg," +
                "dx_cm,dy_cm,dz_cm,d_pitch_deg,d_yaw_deg,d_roll_deg," +
                "position_error_cm,orientation_error_deg,in_position_tol,in_orientation_tol,note"

        val ISO_FORMAT = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSSXXX", Locale.US)

        val SESSION_ID_FORMAT = SimpleDateFormat("yyyyMMdd'T'HHmmss", Locale.US).apply {
            timeZone = TimeZone.getDefault()
        }
    }
}
