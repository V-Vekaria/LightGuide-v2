package com.lightguide.phase0.pose

/**
 * Which frame the reported stand pose is expressed in.
 *
 * Phase 0 must not silently mix the two: an AR world origin is wherever the
 * session happened to start and is meaningless in a later session, while the
 * reference-marker frame is physically reproducible. The UI and every logged
 * row carry this value.
 */
enum class FrameMode {
    /** Relative to the reference marker (studio/subject origin). Reproducible. */
    REFERENCE,

    /** Raw ARCore world origin. Session-local only; not a valid saved pose. */
    AR_WORLD,
}

enum class MarkerRole(val imageName: String) {
    STAND("stand_marker"),
    REFERENCE("reference_marker"),
}

/** A 6-DoF pose plus the Euler view of its rotation, in [frame]. */
data class Pose6(
    val frame: FrameMode,
    val transform: Transform,
) {
    val position: Vec3 get() = transform.translation
    val euler: Euler get() = eulerFrom(transform.rotation)
}

/** Current-vs-target difference. */
data class PoseDelta(
    /**
     * Current minus target, in metres, along the reference frame's
     * right/up/forward axes - the room's axes, not the light's.
     *
     * A photographer pushing a stand thinks in the room: "left" has to mean the
     * room's left. Rotating this into the target's own axes would make "left"
     * a diagonal across the floor whenever the light is aimed off-square.
     */
    val translation: Vec3,
    /** Current relative to target, as reported Euler angles in degrees. */
    val rotation: Euler,
    /** Straight-line position error, centimetres. */
    val positionErrorCm: Float,
    /** Total angular error (axis-angle magnitude), degrees. */
    val orientationErrorDeg: Float,
) {
    companion object {
        /** [target] and [current] must already be in the same frame. */
        fun between(target: Transform, current: Transform): PoseDelta {
            // Translation stays in the shared (reference) frame; only the
            // rotation is taken relative, since "how far is it turned from the
            // saved aim" is only meaningful target-relative.
            val offset = current.translation - target.translation
            val relativeRotation = target.rotation.transpose() * current.rotation
            return PoseDelta(
                translation = offset,
                rotation = eulerFrom(relativeRotation),
                positionErrorCm = offset.length() * 100f,
                orientationErrorDeg = relativeRotation.angleDeg(),
            )
        }
    }
}

/** Configurable pass/fail band for the guidance display. */
data class Tolerances(
    val positionCm: Float = DEFAULT_POSITION_CM,
    val orientationDeg: Float = DEFAULT_ORIENTATION_DEG,
) {
    companion object {
        // Midpoints of the Phase 0 engineering gate in docs/POSITIONING_RESEARCH.md
        // (3-5 cm position, 2-3 deg orientation). Test targets, not claims.
        const val DEFAULT_POSITION_CM = 4.0f
        const val DEFAULT_ORIENTATION_DEG = 2.5f
    }
}

/** Printed size of each marker. Must match the physical print, in metres. */
data class MarkerSizes(
    val standWidthM: Float = DEFAULT_WIDTH_M,
    val referenceWidthM: Float = DEFAULT_WIDTH_M,
) {
    companion object {
        const val DEFAULT_WIDTH_M = 0.20f
    }
}

/** One observation of the stand marker, ready for display and logging. */
data class Reading(
    val timestampMs: Long,
    val frameMode: FrameMode,
    val standPose: Pose6,
    /** Milliseconds since the reference marker was last tracked, null in AR_WORLD. */
    val referenceAgeMs: Long?,
    /**
     * Straight-line phone-camera-to-stand-marker distance, metres.
     *
     * Frame-independent and directly tape-measurable, so it is the fastest
     * check that the printed marker width entered in SETUP is correct: a width
     * that is wrong by some ratio makes this distance wrong by the same ratio.
     */
    val cameraDistanceM: Float?,
    val delta: PoseDelta?,
)
