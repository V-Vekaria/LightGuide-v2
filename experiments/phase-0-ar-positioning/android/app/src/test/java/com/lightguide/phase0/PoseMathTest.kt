package com.lightguide.phase0

import com.lightguide.phase0.guidance.Guidance
import com.lightguide.phase0.pose.DEG_TO_RAD
import com.lightguide.phase0.pose.Mat3
import com.lightguide.phase0.pose.PoseDelta
import com.lightguide.phase0.pose.Quat
import com.lightguide.phase0.pose.Tolerances
import com.lightguide.phase0.pose.Transform
import com.lightguide.phase0.pose.Vec3
import com.lightguide.phase0.pose.eulerFrom
import com.lightguide.phase0.pose.markerToStudio
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.cos
import kotlin.math.sin

/**
 * The sign conventions in the guidance output are easy to get subtly backwards
 * and impossible to spot from a screenshot, so they are pinned here. If these
 * fail, any field measurement taken with the app is suspect.
 */
class PoseMathTest {

    private val eps = 1e-3f

    // --------------------------------------------------------- primitives --

    @Test
    fun `identity rotation has zero euler angles`() {
        val e = eulerFrom(Mat3.IDENTITY)
        assertEquals(0f, e.pitchDeg, eps)
        assertEquals(0f, e.yawDeg, eps)
        assertEquals(0f, e.rollDeg, eps)
    }

    @Test
    fun `positive yaw means turned to the right`() {
        // Rotation about +Y (up) that swings the forward axis toward +X (right).
        val e = eulerFrom(rotY(30f))
        assertEquals(30f, e.yawDeg, eps)
        assertEquals(0f, e.pitchDeg, eps)
        assertEquals(0f, e.rollDeg, eps)
    }

    @Test
    fun `positive pitch means aimed up`() {
        // Rx(-theta) tips +Z toward +Y, i.e. upward.
        val e = eulerFrom(rotX(-20f))
        assertEquals(20f, e.pitchDeg, eps)
        assertEquals(0f, e.yawDeg, eps)
        assertEquals(0f, e.rollDeg, eps)
    }

    @Test
    fun `positive roll means clockwise seen from behind`() {
        // Rz(-phi) drops the right edge, which reads as clockwise from behind.
        val e = eulerFrom(rotZ(-15f))
        assertEquals(15f, e.rollDeg, eps)
        assertEquals(0f, e.pitchDeg, eps)
        assertEquals(0f, e.yawDeg, eps)
    }

    @Test
    fun `quaternion and matrix rotations agree`() {
        // 90 degrees about +Y as a quaternion.
        val half = (45f * DEG_TO_RAD).toFloat()
        val q = Quat(0f, sin(half), 0f, cos(half))
        val fromQuat = eulerFrom(Mat3.fromQuat(q))
        assertEquals(90f, fromQuat.yawDeg, 1e-2f)
    }

    @Test
    fun `transform inverse round trips`() {
        val t = Transform(Vec3(0.3f, -1.2f, 2f), rotY(37f) * rotX(11f))
        val identity = t.inverse() * t
        val e = eulerFrom(identity.rotation)
        assertEquals(0f, identity.translation.length(), eps)
        assertEquals(0f, e.yawDeg, 1e-2f)
        assertEquals(0f, e.pitchDeg, 1e-2f)
    }

    // ---------------------------------------------------- frame handling --

    @Test
    fun `marker to studio remap turns marker normal into forward`() {
        // An identity ARCore image pose has its normal along +Y; after the
        // remap the studio +Z axis must point along that normal.
        val studio = Transform.IDENTITY.markerToStudio()
        val zAxisInWorld = studio.rotation * Vec3(0f, 0f, 1f)
        assertEquals(0f, zAxisInWorld.x, eps)
        assertEquals(1f, zAxisInWorld.y, eps)
        assertEquals(0f, zAxisInWorld.z, eps)

        val yAxisInWorld = studio.rotation * Vec3(0f, 1f, 0f)
        assertEquals(0f, yAxisInWorld.x, eps)
        assertEquals(0f, yAxisInWorld.y, eps)
        assertEquals(-1f, yAxisInWorld.z, eps) // studio up = marker -Z
    }

    @Test
    fun `pose relative to reference is independent of where the world origin is`() {
        val reference = Transform(Vec3(1f, 2f, 3f), rotY(25f))
        val stand = Transform(Vec3(1.5f, 2.4f, 3.9f), rotY(70f))

        val relative = reference.inverse() * stand

        // Rigidly move the whole world; the relative pose must not change.
        val shift = Transform(Vec3(-8f, 4f, 17f), rotY(-63f))
        val shiftedRelative = (shift * reference).inverse() * (shift * stand)

        assertEquals(relative.translation.x, shiftedRelative.translation.x, eps)
        assertEquals(relative.translation.y, shiftedRelative.translation.y, eps)
        assertEquals(relative.translation.z, shiftedRelative.translation.z, eps)
        assertEquals(
            eulerFrom(relative.rotation).yawDeg,
            eulerFrom(shiftedRelative.rotation).yawDeg,
            1e-2f,
        )
    }

    // ----------------------------------------------------------- deltas --

    @Test
    fun `delta reports offsets in the shared reference frame, not the target's`() {
        // Both poses are yawed 90 degrees. The offset is 1 m along reference
        // +X, so it must read as 1 m RIGHT - the room's axes - and must not be
        // rotated into the light's own frame, where it would read as FORWARD.
        val target = Transform(Vec3(0f, 0f, 0f), rotY(90f))
        val current = Transform(Vec3(1f, 0f, 0f), rotY(90f))

        val delta = PoseDelta.between(target, current)

        assertEquals(1f, delta.translation.x, eps)
        assertEquals(0f, delta.translation.y, eps)
        assertEquals(0f, delta.translation.z, eps)
        assertEquals(100f, delta.positionErrorCm, 0.1f)
        assertEquals(0f, delta.orientationErrorDeg, 1e-2f)
    }

    @Test
    fun `linear guidance does not change when the light is turned on the spot`() {
        // Same physical offset, light aimed two different ways. The photographer
        // still has to push the stand the same direction across the floor.
        val offset = Vec3(0.25f, 0f, 0f)
        val square = PoseDelta.between(
            Transform(Vec3.ZERO, Mat3.IDENTITY),
            Transform(offset, Mat3.IDENTITY),
        )
        val turned = PoseDelta.between(
            Transform(Vec3.ZERO, rotY(55f)),
            Transform(offset, rotY(55f)),
        )
        assertEquals(square.translation.x, turned.translation.x, eps)
        assertEquals(square.translation.z, turned.translation.z, eps)
    }

    @Test
    fun `orientation error is the axis angle magnitude`() {
        val target = Transform(Vec3.ZERO, Mat3.IDENTITY)
        val current = Transform(Vec3.ZERO, rotY(12f))
        assertEquals(12f, PoseDelta.between(target, current).orientationErrorDeg, 1e-2f)
    }

    // --------------------------------------------------------- guidance --

    @Test
    fun `a stand too far right is told to move left`() {
        val delta = PoseDelta.between(
            Transform(Vec3.ZERO, Mat3.IDENTITY),
            Transform(Vec3(0.18f, 0f, 0f), Mat3.IDENTITY),
        )
        val step = Guidance.compute(delta, Tolerances()).steps.first { it.axis == "X" }
        assertEquals("LEFT", step.direction)
        assertEquals(18f, step.magnitude, 0.1f)
        assertFalse(step.inTolerance)
    }

    @Test
    fun `a stand too low is told to move up`() {
        val delta = PoseDelta.between(
            Transform(Vec3.ZERO, Mat3.IDENTITY),
            Transform(Vec3(0f, -0.07f, 0f), Mat3.IDENTITY),
        )
        val step = Guidance.compute(delta, Tolerances()).steps.first { it.axis == "Y" }
        assertEquals("UP", step.direction)
        assertEquals(7f, step.magnitude, 0.1f)
    }

    @Test
    fun `a stand yawed right is told to rotate left`() {
        val delta = PoseDelta.between(
            Transform(Vec3.ZERO, Mat3.IDENTITY),
            Transform(Vec3.ZERO, rotY(6f)),
        )
        val step = Guidance.compute(delta, Tolerances()).steps.first { it.axis == "YAW" }
        assertEquals("ROTATE L", step.direction)
        assertEquals(6f, step.magnitude, 1e-2f)
    }

    @Test
    fun `a stand aimed up is told to tilt down`() {
        val delta = PoseDelta.between(
            Transform(Vec3.ZERO, Mat3.IDENTITY),
            Transform(Vec3.ZERO, rotX(-4f)),
        )
        val step = Guidance.compute(delta, Tolerances()).steps.first { it.axis == "PITCH" }
        assertEquals("TILT DOWN", step.direction)
        assertEquals(4f, step.magnitude, 1e-2f)
    }

    @Test
    fun `a pose inside both tolerances passes`() {
        val delta = PoseDelta.between(
            Transform(Vec3.ZERO, Mat3.IDENTITY),
            Transform(Vec3(0.01f, 0.01f, 0.01f), rotY(1f)),
        )
        val result = Guidance.compute(delta, Tolerances(positionCm = 4f, orientationDeg = 2.5f))
        assertTrue(result.positionInTolerance)
        assertTrue(result.orientationInTolerance)
        assertTrue(result.allInTolerance)
    }

    @Test
    fun `a pose outside the position tolerance fails even when square on`() {
        val delta = PoseDelta.between(
            Transform(Vec3.ZERO, Mat3.IDENTITY),
            Transform(Vec3(0.09f, 0f, 0f), Mat3.IDENTITY),
        )
        val result = Guidance.compute(delta, Tolerances(positionCm = 4f, orientationDeg = 2.5f))
        assertFalse(result.positionInTolerance)
        assertTrue(result.orientationInTolerance)
        assertFalse(result.allInTolerance)
    }

    @Test
    fun `an exactly matched pose reports full match`() {
        val pose = Transform(Vec3(0.4f, 1.7f, 2.2f), rotY(15f))
        val result = Guidance.compute(PoseDelta.between(pose, pose), Tolerances())
        assertTrue(result.allInTolerance)
    }

    // ----------------------------------------------------------- helpers --

    private fun rotX(deg: Float): Mat3 {
        val a = deg * DEG_TO_RAD
        val c = cos(a).toFloat()
        val s = sin(a).toFloat()
        return Mat3(
            arrayOf(
                floatArrayOf(1f, 0f, 0f),
                floatArrayOf(0f, c, -s),
                floatArrayOf(0f, s, c),
            )
        )
    }

    private fun rotY(deg: Float): Mat3 {
        val a = deg * DEG_TO_RAD
        val c = cos(a).toFloat()
        val s = sin(a).toFloat()
        return Mat3(
            arrayOf(
                floatArrayOf(c, 0f, s),
                floatArrayOf(0f, 1f, 0f),
                floatArrayOf(-s, 0f, c),
            )
        )
    }

    private fun rotZ(deg: Float): Mat3 {
        val a = deg * DEG_TO_RAD
        val c = cos(a).toFloat()
        val s = sin(a).toFloat()
        return Mat3(
            arrayOf(
                floatArrayOf(c, -s, 0f),
                floatArrayOf(s, c, 0f),
                floatArrayOf(0f, 0f, 1f),
            )
        )
    }
}
