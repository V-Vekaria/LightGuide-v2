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
        // Agreed application matching profile (docs/product/DATABASE_SCHEMA.md
        // ToleranceSet v1: distance/height 0.03 m, direction/tilt 3 deg). This is
        // the "3 cm / 3 deg" test profile from the M0 hardening handoff, not the
        // broader 3-5 cm / 2-3 deg Phase-0 feasibility screen in TEST_PLAN.md -
        // the two are evaluated separately; do not conflate them.
        const val DEFAULT_POSITION_CM = 3.0f
        const val DEFAULT_ORIENTATION_DEG = 3.0f

        /** Pre-hardening default, kept only to recognise inherited stored values. */
        const val LEGACY_POSITION_CM = 4.0f
        const val LEGACY_ORIENTATION_DEG = 2.5f
    }
}

/** Whether a tolerance value in effect is the current profile or an older stored one. */
enum class ToleranceSource { PROFILE_DEFAULT, EXPLICIT_MATCHING_PROFILE, EXPLICIT_DIFFERENT_FROM_PROFILE }

/** Printed size of each marker. Must match the physical print, in metres. */
data class MarkerSizes(
    val standWidthM: Float = DEFAULT_WIDTH_M,
    val referenceWidthM: Float = DEFAULT_WIDTH_M,
) {
    companion object {
        const val DEFAULT_WIDTH_M = 0.20f
    }
}

/**
 * Whether the current stand pose comes from ARCore actually re-detecting the
 * image this frame, or from extrapolating the last real detection after the
 * image left the camera view.
 *
 * ARCore keeps reporting `TrackingState.TRACKING` for a while after an
 * augmented image goes out of view, via `TrackingMethod.LAST_KNOWN_POSE`. A
 * moving stand whose marker just left frame will otherwise look identical to
 * one still being watched, which is exactly backwards for a tool meant to
 * validate positioning: an inferred pose must never enable capture or a
 * measured Match. See docs/validation/AR_SOURCE_AUDIT_2026-09-10.md.
 */
enum class ObservationKind { FULL_TRACKING, INFERRED }

/** Authoritative capture/recreation verdict. Replaces the old cosmetic match percentage. */
enum class MatchState { IN_TOLERANCE, OUT_OF_TOLERANCE, UNVERIFIABLE }

/**
 * ValidityPolicyV1: how long a reference marker's last *actual* detection
 * remains usable before its age alone makes the frame untrustworthy. Chosen
 * conservatively for a validation harness, not tuned from field data; revise
 * through docs/DECISIONS.md if trials show a better figure.
 */
const val REFERENCE_MAX_AGE_MS = 5_000L

/** One observation of the stand marker, ready for display and logging. */
data class Reading(
    val timestampMs: Long,
    val frameMode: FrameMode,
    val standPose: Pose6,
    /** Milliseconds since the reference marker was last actually detected, null in AR_WORLD. */
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
    /** Whether the stand pose above is a fresh detection or an inferred/stale one. */
    val standObservation: ObservationKind,
    /** False once [referenceAgeMs] exceeds [REFERENCE_MAX_AGE_MS], or reference never seen. */
    val referenceValid: Boolean,
    /** ARCore's overall camera pose quality this frame; false must block every claim. */
    val cameraTrackingOk: Boolean,
) {
    /**
     * Whether this reading is trustworthy enough to arm SAVE TARGET.
     *
     * Deliberately does not depend on a saved target's compatibility - that is
     * a separate concern checked against the specific target, not the reading.
     */
    val captureEligible: Boolean
        get() = frameMode == FrameMode.REFERENCE &&
            cameraTrackingOk &&
            standObservation == ObservationKind.FULL_TRACKING &&
            referenceValid
}
