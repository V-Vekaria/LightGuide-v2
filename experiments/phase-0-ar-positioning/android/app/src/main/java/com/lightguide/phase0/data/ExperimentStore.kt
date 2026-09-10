package com.lightguide.phase0.data

import android.content.Context
import android.content.SharedPreferences
import com.lightguide.phase0.pose.FrameMode
import com.lightguide.phase0.pose.MarkerSizes
import com.lightguide.phase0.pose.Mat3
import com.lightguide.phase0.pose.ToleranceSource
import com.lightguide.phase0.pose.Tolerances
import com.lightguide.phase0.pose.Transform
import com.lightguide.phase0.pose.Vec3
import org.json.JSONObject

/**
 * Local, offline persistence for the saved target pose and the experiment
 * settings. SharedPreferences is enough at Phase 0 scale; the JSON shape is
 * kept explicit so a saved target can be read straight out of an adb dump.
 */
class ExperimentStore(context: Context) {

    private val prefs: SharedPreferences =
        context.getSharedPreferences("phase0", Context.MODE_PRIVATE)

    // ------------------------------------------------------------- target --

    data class SavedTarget(
        val frameMode: FrameMode,
        val transform: Transform,
        val savedAtMs: Long,
        val label: String,
        /**
         * Marker widths in effect when this target was captured. A target is
         * only comparable to a current reading captured under the identical
         * configuration - see [com.lightguide.phase0.guidance.Guidance.matchState].
         */
        val referenceConfig: MarkerSizes,
    )

    fun saveTarget(target: SavedTarget) {
        val rotation = target.transform.rotation
        val t = target.transform.translation
        val json = JSONObject().apply {
            put("frameMode", target.frameMode.name)
            put("savedAtMs", target.savedAtMs)
            put("label", target.label)
            put("tx", t.x.toDouble()); put("ty", t.y.toDouble()); put("tz", t.z.toDouble())
            put("standWidthM", target.referenceConfig.standWidthM.toDouble())
            put("referenceWidthM", target.referenceConfig.referenceWidthM.toDouble())
            // Store the rotation matrix directly: it is what the maths uses, so
            // there is no quaternion round-trip to get a sign convention wrong.
            put("r", org.json.JSONArray().apply {
                for (row in rotation.m) for (v in row) put(v.toDouble())
            })
        }
        prefs.edit().putString(KEY_TARGET, json.toString()).apply()
    }

    /**
     * Returns null for a target saved before [referenceConfig] was recorded.
     * A pre-hardening save cannot be verified against the current marker
     * configuration, so it is treated as absent rather than silently assumed
     * compatible - the operator re-saves it explicitly instead.
     */
    fun loadTarget(): SavedTarget? {
        val raw = prefs.getString(KEY_TARGET, null) ?: return null
        return runCatching {
            val json = JSONObject(raw)
            val r = json.getJSONArray("r")
            val m = Array(3) { i -> FloatArray(3) { j -> r.getDouble(i * 3 + j).toFloat() } }
            SavedTarget(
                frameMode = FrameMode.valueOf(json.getString("frameMode")),
                transform = Transform(
                    Vec3(
                        json.getDouble("tx").toFloat(),
                        json.getDouble("ty").toFloat(),
                        json.getDouble("tz").toFloat(),
                    ),
                    Mat3(m),
                ),
                savedAtMs = json.getLong("savedAtMs"),
                label = json.optString("label", "target"),
                referenceConfig = MarkerSizes(
                    standWidthM = json.getDouble("standWidthM").toFloat(),
                    referenceWidthM = json.getDouble("referenceWidthM").toFloat(),
                ),
            )
        }.getOrNull()
    }

    fun clearTarget() = prefs.edit().remove(KEY_TARGET).apply()

    // ----------------------------------------------------------- settings --

    var tolerances: Tolerances
        get() = Tolerances(
            positionCm = prefs.getFloat(KEY_TOL_POS, Tolerances.DEFAULT_POSITION_CM),
            orientationDeg = prefs.getFloat(KEY_TOL_ORI, Tolerances.DEFAULT_ORIENTATION_DEG),
        )
        set(value) = prefs.edit()
            .putFloat(KEY_TOL_POS, value.positionCm)
            .putFloat(KEY_TOL_ORI, value.orientationDeg)
            .apply()

    /**
     * Whether the active [tolerances] are the current 3 cm / 3 deg profile, an
     * explicitly-saved value that happens to match it, or an inherited value
     * from before this profile existed (most notably the old 4 cm / 2.5 deg
     * default, which this store never wrote automatically but earlier builds
     * may have persisted via SETUP > Apply). Nothing here rewrites a stored
     * value; the UI surfaces the distinction instead.
     */
    val toleranceSource: ToleranceSource
        get() = if (!prefs.contains(KEY_TOL_POS) && !prefs.contains(KEY_TOL_ORI)) {
            ToleranceSource.PROFILE_DEFAULT
        } else if (tolerances.positionCm == Tolerances.DEFAULT_POSITION_CM &&
            tolerances.orientationDeg == Tolerances.DEFAULT_ORIENTATION_DEG
        ) {
            ToleranceSource.EXPLICIT_MATCHING_PROFILE
        } else {
            ToleranceSource.EXPLICIT_DIFFERENT_FROM_PROFILE
        }

    var markerSizes: MarkerSizes
        get() = MarkerSizes(
            standWidthM = prefs.getFloat(KEY_W_STAND, MarkerSizes.DEFAULT_WIDTH_M),
            referenceWidthM = prefs.getFloat(KEY_W_REF, MarkerSizes.DEFAULT_WIDTH_M),
        )
        set(value) = prefs.edit()
            .putFloat(KEY_W_STAND, value.standWidthM)
            .putFloat(KEY_W_REF, value.referenceWidthM)
            .apply()

    private companion object {
        const val KEY_TARGET = "target"
        const val KEY_TOL_POS = "tolerancePositionCm"
        const val KEY_TOL_ORI = "toleranceOrientationDeg"
        const val KEY_W_STAND = "standWidthM"
        const val KEY_W_REF = "referenceWidthM"
    }
}
