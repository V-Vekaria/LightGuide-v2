package com.lightguide.phase0.pose

import kotlin.math.abs
import kotlin.math.asin
import kotlin.math.atan2
import kotlin.math.min
import kotlin.math.max
import kotlin.math.acos
import kotlin.math.sqrt

/**
 * Minimal rigid-transform maths for Phase 0.
 *
 * Deliberately independent of `com.google.ar.core.Pose` so the whole
 * pose/delta/guidance chain is plain Kotlin and can be unit tested on the JVM
 * without an ARCore session or a device. ARCore types are converted at the
 * boundary in [com.lightguide.phase0.ar.ArRenderer].
 *
 * ## Frame conventions
 *
 * ARCore reports an augmented image's centre pose with
 *   +X along the image's right edge,
 *   +Y along the image's outward normal,
 *   +Z pointing down the image.
 *
 * That is awkward to talk about in a studio, so every marker pose is remapped
 * once by [MARKER_TO_STUDIO] into a "studio" frame:
 *   +X = right, +Y = up, +Z = out of the marker face (forward).
 *
 * Euler angles use the intrinsic Y-X-Z sequence (yaw about up, then pitch about
 * right, then roll about forward), reported so that
 *   yaw   > 0 -> turned to the RIGHT (clockwise seen from above),
 *   pitch > 0 -> aimed UP,
 *   roll  > 0 -> rolled CLOCKWISE seen from behind, looking along +Z.
 */

const val RAD_TO_DEG = 57.29577951308232
const val DEG_TO_RAD = 0.017453292519943295

/**
 * ARCore works in metres, but a studio tape measure is marked in centimetres.
 * Everything the operator reads - screen and log alike - is centimetres, and
 * this is the only place the conversion happens.
 */
const val M_TO_CM = 100f

data class Vec3(val x: Float, val y: Float, val z: Float) {
    operator fun minus(o: Vec3) = Vec3(x - o.x, y - o.y, z - o.z)
    operator fun plus(o: Vec3) = Vec3(x + o.x, y + o.y, z + o.z)
    fun length(): Float = sqrt((x * x + y * y + z * z).toDouble()).toFloat()

    companion object {
        val ZERO = Vec3(0f, 0f, 0f)
    }
}

/** Unit quaternion, ARCore's (x, y, z, w) ordering. */
data class Quat(val x: Float, val y: Float, val z: Float, val w: Float) {
    fun normalized(): Quat {
        val n = sqrt((x * x + y * y + z * z + w * w).toDouble()).toFloat()
        return if (n < 1e-9f) IDENTITY else Quat(x / n, y / n, z / n, w / n)
    }

    companion object {
        val IDENTITY = Quat(0f, 0f, 0f, 1f)
    }
}

/**
 * Row-major 3x3 rotation matrix. `m[r][c]`, and `M * v` rotates a vector
 * expressed in the local frame into the parent frame.
 */
class Mat3(val m: Array<FloatArray>) {

    operator fun times(o: Mat3): Mat3 {
        val r = Array(3) { FloatArray(3) }
        for (i in 0..2) for (j in 0..2) {
            var s = 0f
            for (k in 0..2) s += m[i][k] * o.m[k][j]
            r[i][j] = s
        }
        return Mat3(r)
    }

    operator fun times(v: Vec3): Vec3 = Vec3(
        m[0][0] * v.x + m[0][1] * v.y + m[0][2] * v.z,
        m[1][0] * v.x + m[1][1] * v.y + m[1][2] * v.z,
        m[2][0] * v.x + m[2][1] * v.y + m[2][2] * v.z,
    )

    /** Rotation matrices are orthonormal, so the transpose is the inverse. */
    fun transpose(): Mat3 = Mat3(Array(3) { i -> FloatArray(3) { j -> m[j][i] } })

    /** Rotation magnitude in degrees, i.e. the axis-angle angle. */
    fun angleDeg(): Float {
        val trace = m[0][0] + m[1][1] + m[2][2]
        val c = ((trace - 1f) / 2f).coerceIn(-1f, 1f)
        return (acos(c.toDouble()) * RAD_TO_DEG).toFloat()
    }

    companion object {
        val IDENTITY = Mat3(
            arrayOf(
                floatArrayOf(1f, 0f, 0f),
                floatArrayOf(0f, 1f, 0f),
                floatArrayOf(0f, 0f, 1f),
            )
        )

        fun fromQuat(q0: Quat): Mat3 {
            val q = q0.normalized()
            val x = q.x; val y = q.y; val z = q.z; val w = q.w
            return Mat3(
                arrayOf(
                    floatArrayOf(1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)),
                    floatArrayOf(2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)),
                    floatArrayOf(2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)),
                )
            )
        }
    }
}

/**
 * Rotation taking a raw ARCore augmented-image frame to the studio frame:
 * studio X = marker right, studio Y = marker up (-marker Z), studio Z = marker
 * normal. Columns are the studio basis vectors expressed in marker axes.
 */
val MARKER_TO_STUDIO = Mat3(
    arrayOf(
        floatArrayOf(1f, 0f, 0f),
        floatArrayOf(0f, 0f, 1f),
        floatArrayOf(0f, -1f, 0f),
    )
)

/** Position + orientation of a frame, expressed in some parent frame. */
data class Transform(val translation: Vec3, val rotation: Mat3) {

    fun inverse(): Transform {
        val rt = rotation.transpose()
        val t = rt * translation
        return Transform(Vec3(-t.x, -t.y, -t.z), rt)
    }

    /** `this * other`: re-expresses [other] (a child of this) in this frame's parent. */
    operator fun times(other: Transform): Transform =
        Transform(translation + (rotation * other.translation), rotation * other.rotation)

    companion object {
        val IDENTITY = Transform(Vec3.ZERO, Mat3.IDENTITY)

        /** Builds a transform from an ARCore-style translation + quaternion. */
        fun of(translation: Vec3, quaternion: Quat) =
            Transform(translation, Mat3.fromQuat(quaternion))
    }
}

/** Applies [MARKER_TO_STUDIO] to a raw augmented-image pose. */
fun Transform.markerToStudio(): Transform = Transform(translation, rotation * MARKER_TO_STUDIO)

data class Euler(val pitchDeg: Float, val yawDeg: Float, val rollDeg: Float) {
    companion object {
        val ZERO = Euler(0f, 0f, 0f)
    }
}

/**
 * Extracts intrinsic Y-X-Z Euler angles from [r], with the reporting signs
 * described at the top of this file (pitch up positive, roll clockwise
 * positive, yaw right positive).
 */
fun eulerFrom(r: Mat3): Euler {
    val m = r.m
    val sinPitch = (-m[1][2]).coerceIn(-1f, 1f)
    val pitch = asin(sinPitch.toDouble())

    // Near +/-90 degrees of pitch, yaw and roll describe the same rotation;
    // collapse the ambiguity onto roll = 0 rather than emitting noise.
    val gimbalLocked = abs(sinPitch) > 0.99999f
    val yaw: Double
    val roll: Double
    if (gimbalLocked) {
        yaw = atan2(-m[2][0].toDouble(), m[0][0].toDouble())
        roll = 0.0
    } else {
        yaw = atan2(m[0][2].toDouble(), m[2][2].toDouble())
        roll = atan2(m[1][0].toDouble(), m[1][1].toDouble())
    }

    return Euler(
        pitchDeg = (-pitch * RAD_TO_DEG).toFloat(),
        yawDeg = (yaw * RAD_TO_DEG).toFloat(),
        rollDeg = (-roll * RAD_TO_DEG).toFloat(),
    )
}

fun clamp01(v: Float): Float = max(0f, min(1f, v))
