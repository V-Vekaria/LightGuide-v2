package com.lightguide.phase0.ar

import android.opengl.GLES20
import android.opengl.GLSurfaceView
import com.google.ar.core.AugmentedImage
import com.google.ar.core.Session
import com.google.ar.core.TrackingFailureReason
import com.google.ar.core.TrackingState
import com.lightguide.phase0.data.ExperimentStore
import com.lightguide.phase0.pose.FrameMode
import com.lightguide.phase0.pose.MarkerRole
import com.lightguide.phase0.pose.Pose6
import com.lightguide.phase0.pose.PoseDelta
import com.lightguide.phase0.pose.Quat
import com.lightguide.phase0.pose.Reading
import com.lightguide.phase0.pose.Transform
import com.lightguide.phase0.pose.Vec3
import com.lightguide.phase0.pose.markerToStudio
import javax.microedition.khronos.egl.EGLConfig
import javax.microedition.khronos.opengles.GL10

/**
 * Drives the AR session on the GL thread and publishes one [ArState] per frame.
 *
 * Marker poses come from ARCore augmented images, which is the mechanism that
 * makes the printed marker's known physical width matter: the scale of the
 * estimated pose is set by that width, so a mis-measured print shows up as a
 * proportional distance error.
 */
class ArRenderer(
    private val displayRotationHelper: DisplayRotationHelper,
    private val listener: Listener,
) : GLSurfaceView.Renderer {

    fun interface Listener {
        fun onArState(state: ArState)
    }

    data class ArState(
        val cameraTracking: TrackingState,
        val trackingFailureReason: String?,
        val standVisible: Boolean,
        val referenceEverSeen: Boolean,
        val referenceVisible: Boolean,
        val frameMode: FrameMode,
        val reading: Reading?,
        /** Set when a saved target exists but was captured in a different frame. */
        val targetFrameMismatch: Boolean,
        val error: String?,
    )

    private val background = CameraBackgroundRenderer()

    @Volatile
    var session: Session? = null

    /** Latest saved target, or null. Written from the UI thread. */
    @Volatile
    var target: ExperimentStore.SavedTarget? = null

    // Last known pose of the reference marker in AR world space. Re-latched on
    // every frame it is visible so that, while both markers are in view, the
    // relative measurement is unaffected by world-tracking drift; when it goes
    // out of view the last value keeps the frame usable, and referenceAgeMs
    // records how stale it was for every logged sample.
    private var referenceWorld: Transform? = null
    private var referenceSeenAtMs: Long = 0L

    override fun onSurfaceCreated(gl: GL10?, config: EGLConfig?) {
        GLES20.glClearColor(0f, 0f, 0f, 1f)
        background.createOnGlThread()
    }

    override fun onSurfaceChanged(gl: GL10?, width: Int, height: Int) {
        displayRotationHelper.onSurfaceChanged(width, height)
        GLES20.glViewport(0, 0, width, height)
    }

    override fun onDrawFrame(gl: GL10?) {
        GLES20.glClear(GLES20.GL_COLOR_BUFFER_BIT or GLES20.GL_DEPTH_BUFFER_BIT)
        val session = this.session ?: return

        try {
            session.setCameraTextureName(background.textureId)
            displayRotationHelper.updateSessionIfNeeded(session)

            val frame = session.update()
            background.draw(frame)

            listener.onArState(
                buildState(
                    session = session,
                    cameraTracking = frame.camera.trackingState,
                    failureReason = frame.camera.trackingFailureReason
                        ?.takeIf { it != TrackingFailureReason.NONE }
                        ?.name,
                    cameraPosition = frame.camera.pose.toTransform().translation,
                )
            )
        } catch (t: Throwable) {
            listener.onArState(
                ArState(
                    cameraTracking = TrackingState.STOPPED,
                    trackingFailureReason = null,
                    standVisible = false,
                    referenceEverSeen = referenceWorld != null,
                    referenceVisible = false,
                    frameMode = if (referenceWorld != null) FrameMode.REFERENCE else FrameMode.AR_WORLD,
                    reading = null,
                    targetFrameMismatch = false,
                    error = t.message ?: t.javaClass.simpleName,
                )
            )
        }
    }

    /** Discards the latched studio origin so a fresh one can be established. */
    fun resetReference() {
        referenceWorld = null
        referenceSeenAtMs = 0L
    }

    private fun buildState(
        session: Session,
        cameraTracking: TrackingState,
        failureReason: String?,
        cameraPosition: Vec3,
    ): ArState {
        val now = System.currentTimeMillis()

        var standWorld: Transform? = null
        var referenceVisible = false

        for (image in session.getAllTrackables(AugmentedImage::class.java)) {
            if (image.trackingState != TrackingState.TRACKING) continue
            val pose = image.centerPose.toTransform().markerToStudio()
            when (image.name) {
                MarkerRole.STAND.imageName -> standWorld = pose
                MarkerRole.REFERENCE.imageName -> {
                    referenceWorld = pose
                    referenceSeenAtMs = now
                    referenceVisible = true
                }
            }
        }

        val reference = referenceWorld
        val frameMode = if (reference != null) FrameMode.REFERENCE else FrameMode.AR_WORLD

        val standPose = standWorld?.let {
            Pose6(frameMode, if (reference != null) reference.inverse() * it else it)
        }

        val savedTarget = target
        val frameMismatch = savedTarget != null && savedTarget.frameMode != frameMode
        val delta = if (standPose != null && savedTarget != null && !frameMismatch) {
            PoseDelta.between(savedTarget.transform, standPose.transform)
        } else {
            null
        }

        val reading = standPose?.let { pose ->
            Reading(
                timestampMs = now,
                frameMode = frameMode,
                standPose = pose,
                referenceAgeMs = if (reference != null) now - referenceSeenAtMs else null,
                cameraDistanceM = standWorld?.let { world ->
                    (world.translation - cameraPosition).length()
                },
                delta = delta,
            )
        }

        return ArState(
            cameraTracking = cameraTracking,
            trackingFailureReason = failureReason,
            standVisible = standWorld != null,
            referenceEverSeen = reference != null,
            referenceVisible = referenceVisible,
            frameMode = frameMode,
            reading = reading,
            targetFrameMismatch = frameMismatch,
            error = null,
        )
    }
}

/** Converts an ARCore pose into the plain-Kotlin [Transform] used everywhere else. */
private fun com.google.ar.core.Pose.toTransform(): Transform {
    val t = FloatArray(3)
    val q = FloatArray(4)
    getTranslation(t, 0)
    getRotationQuaternion(q, 0)
    return Transform.of(Vec3(t[0], t[1], t[2]), Quat(q[0], q[1], q[2], q[3]))
}
