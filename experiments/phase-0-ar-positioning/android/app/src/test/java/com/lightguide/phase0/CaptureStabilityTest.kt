package com.lightguide.phase0

import com.lightguide.phase0.pose.*
import org.junit.Assert.*
import org.junit.Test

class CaptureStabilityTest {
    private val pose = Transform(Vec3(0f, 0f, 0f), Mat3.IDENTITY)
    @Test fun `requires a full second of fresh stable observations`() {
        val gate = CaptureStability()
        gate.observe(pose, 1000L)
        assertFalse(gate.ready(2000L)) // one old frame cannot establish stability
        gate.observe(pose, 1500L)
        assertFalse(gate.ready(1500L))
        gate.observe(pose, 2000L)
        assertTrue(gate.ready(2000L))
        assertFalse(gate.ready(2751L))
        gate.observe(null, 0L)
        assertFalse(gate.ready(2000L))
    }
    @Test fun `motion and clock reversal restart the capture window`() {
        val gate = CaptureStability()
        gate.observe(pose, 1000L)
        gate.observe(pose, 1500L)
        gate.observe(Transform(Vec3(.02f, 0f, 0f), Mat3.IDENTITY), 2000L)
        assertFalse(gate.ready(2000L))
        gate.observe(pose, 500L)
        assertFalse(gate.ready(500L))
    }
}
