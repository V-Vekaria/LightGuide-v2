package com.lightguide.phase0

import com.lightguide.phase0.guidance.Guidance
import com.lightguide.phase0.pose.FrameMode
import com.lightguide.phase0.pose.MarkerSizes
import com.lightguide.phase0.pose.MatchState
import com.lightguide.phase0.pose.ObservationKind
import com.lightguide.phase0.pose.Pose6
import com.lightguide.phase0.pose.PoseDelta
import com.lightguide.phase0.pose.REFERENCE_MAX_AGE_MS
import com.lightguide.phase0.pose.Reading
import com.lightguide.phase0.pose.Tolerances
import com.lightguide.phase0.pose.Transform
import com.lightguide.phase0.pose.Vec3
import org.junit.Assert.assertEquals
import org.junit.Test

/**
 * Coverage for the M0 hardening in docs/validation/AR_SOURCE_AUDIT_2026-09-10.md:
 * the 3 cm / 3 deg profile boundary, the removal of the cosmetic match
 * percentage in favour of an authoritative [MatchState], and refusing to
 * confirm a match on an inferred pose, a stale reference or lost camera
 * tracking. These are the checks the audit calls "reference identity,
 * stale/lost tracking, boundary acceptance and recovery".
 */
class MatchStateTest {

    private val tolerances = Tolerances(positionCm = 3.0f, orientationDeg = 3.0f)

    private fun reading(
        standObservation: ObservationKind = ObservationKind.FULL_TRACKING,
        referenceValid: Boolean = true,
        cameraTrackingOk: Boolean = true,
        referenceAgeMs: Long? = 0L,
    ) = Reading(
        timestampMs = 0L,
        frameMode = FrameMode.REFERENCE,
        standPose = Pose6(FrameMode.REFERENCE, Transform.IDENTITY),
        referenceAgeMs = referenceAgeMs,
        cameraDistanceM = 2f,
        delta = null,
        standObservation = standObservation,
        referenceValid = referenceValid,
        cameraTrackingOk = cameraTrackingOk,
    )

    private fun deltaOf(positionCm: Float, orientationDeg: Float = 0f): PoseDelta = PoseDelta(
        translation = Vec3(positionCm / 100f, 0f, 0f),
        rotation = com.lightguide.phase0.pose.Euler(0f, orientationDeg, 0f),
        positionErrorCm = positionCm,
        orientationErrorDeg = orientationDeg,
    )

    // -------------------------------------------------- tolerance boundary --

    @Test
    fun `position exactly at the 3cm profile boundary passes`() {
        val result = Guidance.compute(deltaOf(3.0f), tolerances)
        assertEquals(true, result.positionInTolerance)
    }

    @Test
    fun `position just outside the 3cm profile boundary fails`() {
        val result = Guidance.compute(deltaOf(3.01f), tolerances)
        assertEquals(false, result.positionInTolerance)
    }

    @Test
    fun `orientation exactly at the 3deg profile boundary passes`() {
        val result = Guidance.compute(deltaOf(0f, 3.0f), tolerances)
        assertEquals(true, result.orientationInTolerance)
    }

    @Test
    fun `orientation just outside the 3deg profile boundary fails`() {
        val result = Guidance.compute(deltaOf(0f, 3.01f), tolerances)
        assertEquals(false, result.orientationInTolerance)
    }

    // -------------------------------------------------------- match state --

    @Test
    fun `a fresh valid reading in tolerance reports IN_TOLERANCE`() {
        val state = Guidance.matchState(reading(), deltaOf(1f), targetIncompatible = false, tolerances)
        assertEquals(MatchState.IN_TOLERANCE, state)
    }

    @Test
    fun `a fresh valid reading out of tolerance reports OUT_OF_TOLERANCE, not unverifiable`() {
        val state = Guidance.matchState(reading(), deltaOf(9f), targetIncompatible = false, tolerances)
        assertEquals(MatchState.OUT_OF_TOLERANCE, state)
    }

    @Test
    fun `an inferred stand pose is unverifiable even when numerically in tolerance`() {
        val bad = reading(standObservation = ObservationKind.INFERRED)
        val state = Guidance.matchState(bad, deltaOf(0.1f), targetIncompatible = false, tolerances)
        assertEquals(MatchState.UNVERIFIABLE, state)
    }

    @Test
    fun `a stale reference beyond the max age is unverifiable`() {
        val bad = reading(referenceValid = false, referenceAgeMs = REFERENCE_MAX_AGE_MS + 1)
        val state = Guidance.matchState(bad, deltaOf(0.1f), targetIncompatible = false, tolerances)
        assertEquals(MatchState.UNVERIFIABLE, state)
    }

    @Test
    fun `lost camera tracking is unverifiable`() {
        val bad = reading(cameraTrackingOk = false)
        val state = Guidance.matchState(bad, deltaOf(0.1f), targetIncompatible = false, tolerances)
        assertEquals(MatchState.UNVERIFIABLE, state)
    }

    @Test
    fun `an incompatible target is unverifiable regardless of the numeric delta`() {
        val state = Guidance.matchState(reading(), deltaOf(0.1f), targetIncompatible = true, tolerances)
        assertEquals(MatchState.UNVERIFIABLE, state)
    }

    @Test
    fun `no delta at all is unverifiable`() {
        val state = Guidance.matchState(reading(), delta = null, targetIncompatible = false, tolerances)
        assertEquals(MatchState.UNVERIFIABLE, state)
    }

    // ---------------------------------------------------- capture eligibility --

    @Test
    fun `a fresh, valid, in-frame reading is capture eligible`() {
        assertEquals(true, reading().captureEligible)
    }

    @Test
    fun `an inferred stand pose is not capture eligible`() {
        assertEquals(false, reading(standObservation = ObservationKind.INFERRED).captureEligible)
    }

    @Test
    fun `a stale reference is not capture eligible`() {
        assertEquals(false, reading(referenceValid = false).captureEligible)
    }

    @Test
    fun `lost camera tracking is not capture eligible`() {
        assertEquals(false, reading(cameraTrackingOk = false).captureEligible)
    }

    @Test
    fun `AR_WORLD frame is not capture eligible even if otherwise fresh`() {
        val worldFrame = reading().copy(frameMode = FrameMode.AR_WORLD)
        assertEquals(false, worldFrame.captureEligible)
    }

    // -------------------------------------------------- reference identity --

    @Test
    fun `marker sizes that differ are not the same reference configuration`() {
        val saved = MarkerSizes(standWidthM = 0.20f, referenceWidthM = 0.20f)
        val current = MarkerSizes(standWidthM = 0.25f, referenceWidthM = 0.20f)
        assertEquals(false, saved == current)
    }

    @Test
    fun `identical marker sizes are recognised as the same reference configuration`() {
        val saved = MarkerSizes(standWidthM = 0.20f, referenceWidthM = 0.18f)
        val current = MarkerSizes(standWidthM = 0.20f, referenceWidthM = 0.18f)
        assertEquals(true, saved == current)
    }
}
