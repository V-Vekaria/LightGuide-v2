package com.lightguide.phase0

import com.lightguide.phase0.pose.ObservationGate
import com.lightguide.phase0.pose.*
import com.lightguide.phase0.guidance.Guidance
import org.junit.Assert.*
import org.junit.Test

class ObservationGateTest {
    @Test fun `inferred stand and missing reference cannot confirm match`() {
        assertFalse(ObservationGate.permits(true, false, true, 1000, 1100))
        assertFalse(ObservationGate.permits(true, true, false, 1000, 1100))
        assertFalse(ObservationGate.permits(false, true, true, 1000, 1100))
    }
    @Test fun `frozen frame expires even while tracking flag remains true`() {
        assertTrue(ObservationGate.permits(true, true, true, 1000, 1750))
        assertFalse(ObservationGate.permits(true, true, true, 1000, 1751))
        assertFalse(ObservationGate.permits(true, true, true, 1100, 1000))
        assertFalse(ObservationGate.permits(true, true, true, 0, 100))
    }
    @Test fun `three centimetre profile rejects a four centimetre return`() {
        val target = Transform(Vec3.ZERO, Mat3.IDENTITY)
        val near = Transform(Vec3(0.029f, 0f, 0f), Mat3.IDENTITY)
        val far = Transform(Vec3(0.04f, 0f, 0f), Mat3.IDENTITY)
        assertTrue(Guidance.compute(PoseDelta.between(target, near), Tolerances()).allInTolerance)
        assertFalse(Guidance.compute(PoseDelta.between(target, far), Tolerances()).allInTolerance)
    }
}
