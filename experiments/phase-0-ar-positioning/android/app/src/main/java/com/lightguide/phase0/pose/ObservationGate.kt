package com.lightguide.phase0.pose

/** Conservative experiment policy: both exact images must be observed now.
 * An inferred pose is never a new measurement of a moving stand. */
object ObservationGate {
    const val MAX_AGE_MS = 750L
    fun permits(cameraTracking: Boolean, standObserved: Boolean, referenceObserved: Boolean,
                observedAtMs: Long, nowMs: Long): Boolean =
        cameraTracking && standObserved && referenceObserved &&
            observedAtMs > 0 && nowMs >= observedAtMs && nowMs - observedAtMs <= MAX_AGE_MS
}
