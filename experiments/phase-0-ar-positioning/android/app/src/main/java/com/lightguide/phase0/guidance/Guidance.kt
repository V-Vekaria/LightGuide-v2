package com.lightguide.phase0.guidance

import com.lightguide.phase0.pose.MatchState
import com.lightguide.phase0.pose.ObservationKind
import com.lightguide.phase0.pose.PoseDelta
import com.lightguide.phase0.pose.Reading
import com.lightguide.phase0.pose.Tolerances
import kotlin.math.abs

/**
 * Turns a current-vs-target [PoseDelta] into the plain instructions a
 * photographer can act on while physically moving a stand.
 *
 * All six axes are always emitted, each with its own in-tolerance flag, rather
 * than only the out-of-tolerance ones. For a validation experiment, seeing an
 * axis sit at 0.4 cm is information; seeing it disappear is not.
 */
object Guidance {

    /** One instruction line, e.g. LEFT 18 cm. */
    data class Step(
        val axis: String,
        val direction: String,
        val magnitude: Float,
        val unit: String,
        val inTolerance: Boolean,
    ) {
        fun format(): String {
            val mark = if (inTolerance) "OK " else "-> "
            return String.format("%s%-9s %6.1f %s", mark, direction, magnitude, unit)
        }
    }

    data class Result(
        val steps: List<Step>,
        val positionInTolerance: Boolean,
        val orientationInTolerance: Boolean,
    ) {
        val allInTolerance: Boolean get() = positionInTolerance && orientationInTolerance
    }

    // Per-axis bands. The straight-line position error is checked against the
    // full tolerance; giving each of the three axes the full budget too would
    // let a pose pass per-axis while failing overall, so axes get the tolerance
    // divided across three dimensions.
    private const val AXIS_SHARE = 0.577f // 1/sqrt(3)

    fun compute(delta: PoseDelta, tolerances: Tolerances): Result {
        val posAxisTolCm = tolerances.positionCm * AXIS_SHARE
        val oriAxisTolDeg = tolerances.orientationDeg * AXIS_SHARE

        // Instructions describe the correction, so each is the opposite of the
        // measured offset: a stand sitting to the right must be moved left.
        val dxCm = delta.translation.x * 100f
        val dyCm = delta.translation.y * 100f
        val dzCm = delta.translation.z * 100f

        val steps = listOf(
            linearStep("X", dxCm, "RIGHT", "LEFT", posAxisTolCm),
            linearStep("Y", dyCm, "UP", "DOWN", posAxisTolCm),
            linearStep("Z", dzCm, "FORWARD", "BACK", posAxisTolCm),
            angularStep("YAW", delta.rotation.yawDeg, "ROTATE R", "ROTATE L", oriAxisTolDeg),
            angularStep("PITCH", delta.rotation.pitchDeg, "TILT UP", "TILT DOWN", oriAxisTolDeg),
            angularStep("ROLL", delta.rotation.rollDeg, "ROLL CW", "ROLL CCW", oriAxisTolDeg),
        )

        return Result(
            steps = steps,
            positionInTolerance = delta.positionErrorCm <= tolerances.positionCm,
            orientationInTolerance = delta.orientationErrorDeg <= tolerances.orientationDeg,
        )
    }

    /**
     * The single authoritative verdict for display and logging.
     *
     * Numeric in-tolerance alone is not enough: an inferred stand pose, a
     * stale/never-seen reference, lost camera tracking or a target saved under
     * a different frame/marker configuration must all read as UNVERIFIABLE
     * rather than silently falling back to whatever the numbers say. Replaces
     * the removed cosmetic match percentage.
     */
    fun matchState(
        reading: Reading,
        delta: PoseDelta?,
        targetIncompatible: Boolean,
        tolerances: Tolerances,
    ): MatchState {
        if (delta == null || targetIncompatible) return MatchState.UNVERIFIABLE
        if (!reading.cameraTrackingOk) return MatchState.UNVERIFIABLE
        if (reading.standObservation != ObservationKind.FULL_TRACKING) return MatchState.UNVERIFIABLE
        if (!reading.referenceValid) return MatchState.UNVERIFIABLE
        return if (compute(delta, tolerances).allInTolerance) {
            MatchState.IN_TOLERANCE
        } else {
            MatchState.OUT_OF_TOLERANCE
        }
    }

    /**
     * @param offset how far the stand currently sits along the axis, in cm.
     * @param correctionForNegative instruction when the stand is on the negative side.
     * @param correctionForPositive instruction when the stand is on the positive side.
     */
    private fun linearStep(
        axis: String,
        offset: Float,
        correctionForNegative: String,
        correctionForPositive: String,
        toleranceCm: Float,
    ): Step = Step(
        axis = axis,
        direction = if (offset >= 0f) correctionForPositive else correctionForNegative,
        magnitude = abs(offset),
        unit = "cm",
        inTolerance = abs(offset) <= toleranceCm,
    )

    private fun angularStep(
        axis: String,
        offset: Float,
        correctionForNegative: String,
        correctionForPositive: String,
        toleranceDeg: Float,
    ): Step = Step(
        axis = axis,
        direction = if (offset >= 0f) correctionForPositive else correctionForNegative,
        magnitude = abs(offset),
        unit = "deg",
        inTolerance = abs(offset) <= toleranceDeg,
    )
}
