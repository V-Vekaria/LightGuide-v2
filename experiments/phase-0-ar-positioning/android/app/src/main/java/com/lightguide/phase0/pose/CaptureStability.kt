package com.lightguide.phase0.pose

/** Capture gate only: a steady observed pose is not an accuracy guarantee. */
class CaptureStability {
    private var baseline: Transform? = null
    private var startedAt = 0L
    private var lastAt = 0L

    @Synchronized fun observe(pose: Transform?, observedAt: Long) {
        if (pose == null || observedAt <= 0L) { baseline = null; startedAt = 0L; lastAt = 0L; return }
        val previous = baseline
        val delta = previous?.let { PoseDelta.between(it, pose) }
        if (previous == null || observedAt < lastAt || observedAt - lastAt > 750L ||
            delta == null || !delta.positionErrorCm.isFinite() || !delta.orientationErrorDeg.isFinite() ||
            delta.positionErrorCm > 1f || delta.orientationErrorDeg > 1f) {
            baseline = pose
            startedAt = observedAt
        }
        lastAt = observedAt
    }

    @Synchronized fun ready(now: Long): Boolean = baseline != null && now >= lastAt &&
        now - lastAt <= 750L && lastAt - startedAt >= 1_000L
}
