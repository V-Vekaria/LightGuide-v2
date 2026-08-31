package com.lightguide.phase0

import android.Manifest
import android.app.Activity
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import android.opengl.GLSurfaceView
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.view.View
import android.widget.Button
import android.widget.EditText
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.FileProvider
import com.google.ar.core.ArCoreApk
import com.google.ar.core.Config
import com.google.ar.core.Session
import com.google.ar.core.TrackingState
import com.google.ar.core.exceptions.CameraNotAvailableException
import com.google.ar.core.exceptions.UnavailableApkTooOldException
import com.google.ar.core.exceptions.UnavailableArcoreNotInstalledException
import com.google.ar.core.exceptions.UnavailableDeviceNotCompatibleException
import com.google.ar.core.exceptions.UnavailableSdkTooOldException
import com.lightguide.phase0.ar.ArRenderer
import com.lightguide.phase0.ar.DisplayRotationHelper
import com.lightguide.phase0.ar.MarkerDatabase
import com.lightguide.phase0.data.ExperimentStore
import com.lightguide.phase0.guidance.Guidance
import com.lightguide.phase0.log.MeasurementLogger
import com.lightguide.phase0.pose.FrameMode
import com.lightguide.phase0.pose.M_TO_CM
import com.lightguide.phase0.pose.MarkerSizes
import com.lightguide.phase0.pose.Reading
import com.lightguide.phase0.pose.Tolerances
import java.util.Locale

/**
 * Phase 0 AR positioning validation harness.
 *
 * Single screen on purpose. The value of this app is the numbers and the log,
 * so the UI does nothing except show them and let the operator drive a trial.
 */
class MainActivity : Activity(), ArRenderer.Listener {

    private lateinit var surface: GLSurfaceView
    private lateinit var statusView: TextView
    private lateinit var poseView: TextView
    private lateinit var guidanceView: TextView
    private lateinit var verdictView: TextView
    private lateinit var setupPanel: View
    private lateinit var standWidthField: EditText
    private lateinit var referenceWidthField: EditText
    private lateinit var positionToleranceField: EditText
    private lateinit var orientationToleranceField: EditText
    private lateinit var recordButton: Button
    private lateinit var noteField: EditText

    private lateinit var store: ExperimentStore
    private lateinit var logger: MeasurementLogger
    private lateinit var renderer: ArRenderer
    private lateinit var displayRotationHelper: DisplayRotationHelper

    private val main = Handler(Looper.getMainLooper())

    private var session: Session? = null
    private var installRequested = false
    private var sessionError: String? = null

    /** Latest state from the GL thread; read on the UI thread when refreshing. */
    @Volatile
    private var latestState: ArRenderer.ArState? = null

    private var lastSampleLogMs = 0L

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        store = ExperimentStore(this)
        logger = MeasurementLogger(this)
        displayRotationHelper = DisplayRotationHelper(this)
        renderer = ArRenderer(displayRotationHelper, this)
        renderer.target = store.loadTarget()

        bindViews()
        applyWindowInsets()
        configureSurface()
        loadSettingsIntoFields()

        logger.logEvent(
            MeasurementLogger.EventType.SESSION_START,
            "app session ${logger.sessionId}",
            null,
            store.tolerances,
        )
    }

    private fun bindViews() {
        surface = findViewById(R.id.surface)
        statusView = findViewById(R.id.status)
        poseView = findViewById(R.id.pose)
        guidanceView = findViewById(R.id.guidance)
        verdictView = findViewById(R.id.verdict)
        setupPanel = findViewById(R.id.setupPanel)
        standWidthField = findViewById(R.id.standWidth)
        referenceWidthField = findViewById(R.id.referenceWidth)
        positionToleranceField = findViewById(R.id.positionTolerance)
        orientationToleranceField = findViewById(R.id.orientationTolerance)
        recordButton = findViewById(R.id.record)
        noteField = findViewById(R.id.note)

        findViewById<Button>(R.id.saveTarget).setOnClickListener { saveTarget() }
        findViewById<Button>(R.id.clearTarget).setOnClickListener { clearTarget() }
        findViewById<Button>(R.id.resetReference).setOnClickListener { resetReference() }
        findViewById<Button>(R.id.markTrial).setOnClickListener { markTrial() }
        findViewById<Button>(R.id.logNote).setOnClickListener { logNote() }
        findViewById<Button>(R.id.export).setOnClickListener { exportLog() }
        findViewById<Button>(R.id.applySetup).setOnClickListener { applySetup() }
        recordButton.setOnClickListener { toggleRecording() }
        findViewById<Button>(R.id.toggleSetup).setOnClickListener {
            setupPanel.visibility =
                if (setupPanel.visibility == View.VISIBLE) View.GONE else View.VISIBLE
        }
    }

    /**
     * Keeps the overlays clear of the status and navigation bars under
     * edge-to-edge, without insetting the camera preview itself.
     */
    private fun applyWindowInsets() {
        val bottomPanel = findViewById<View>(R.id.bottomPanel)
        findViewById<View>(R.id.root).setOnApplyWindowInsetsListener { _, insets ->
            @Suppress("DEPRECATION")
            val top = insets.systemWindowInsetTop
            @Suppress("DEPRECATION")
            val bottom = insets.systemWindowInsetBottom
            statusView.setPadding(PANEL_PADDING_PX, top + PANEL_PADDING_PX, PANEL_PADDING_PX, PANEL_PADDING_PX)
            bottomPanel.setPadding(
                PANEL_PADDING_PX, PANEL_PADDING_PX, PANEL_PADDING_PX, bottom + PANEL_PADDING_PX,
            )
            insets
        }
    }

    private fun configureSurface() {
        surface.preserveEGLContextOnPause = true
        surface.setEGLContextClientVersion(2)
        surface.setEGLConfigChooser(8, 8, 8, 8, 16, 0)
        surface.setRenderer(renderer)
        surface.renderMode = GLSurfaceView.RENDERMODE_CONTINUOUSLY
    }

    private fun loadSettingsIntoFields() {
        val sizes = store.markerSizes
        val tolerances = store.tolerances
        standWidthField.setText(fmt(sizes.standWidthM * M_TO_CM))
        referenceWidthField.setText(fmt(sizes.referenceWidthM * M_TO_CM))
        positionToleranceField.setText(fmt(tolerances.positionCm))
        orientationToleranceField.setText(fmt(tolerances.orientationDeg))
    }

    // --------------------------------------------------------- lifecycle --

    override fun onResume() {
        super.onResume()
        if (!hasCameraPermission()) {
            requestPermissions(arrayOf(Manifest.permission.CAMERA), CAMERA_PERMISSION_REQUEST)
            return
        }
        resumeAr()
    }

    private fun resumeAr() {
        startOrResumeSession()
        surface.onResume()
        displayRotationHelper.onResume()
        scheduleUiRefresh()
    }

    override fun onPause() {
        super.onPause()
        displayRotationHelper.onPause()
        surface.onPause()
        session?.pause()
        main.removeCallbacksAndMessages(null)
    }

    override fun onDestroy() {
        session?.close()
        session = null
        super.onDestroy()
    }

    override fun onRequestPermissionsResult(
        requestCode: Int,
        permissions: Array<out String>,
        grantResults: IntArray,
    ) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults)
        if (requestCode != CAMERA_PERMISSION_REQUEST) return
        if (hasCameraPermission()) {
            resumeAr()
        } else {
            sessionError = "Camera permission denied. AR positioning cannot run without it."
            refreshUi()
        }
    }

    private fun hasCameraPermission() =
        checkSelfPermission(Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED

    // ------------------------------------------------------- AR session --

    private fun startOrResumeSession() {
        if (session == null) {
            session = createSession() ?: return
        }
        try {
            session?.resume()
            renderer.session = session
            sessionError = null
        } catch (e: CameraNotAvailableException) {
            session?.close()
            session = null
            renderer.session = null
            sessionError = "Camera not available: ${e.message}"
        }
    }

    /**
     * Returns null when the session could not be created; [sessionError] then
     * holds the reason, which the status line shows verbatim so a device or
     * ARCore problem is reported rather than hidden behind a blank preview.
     */
    private fun createSession(): Session? {
        try {
            when (ArCoreApk.getInstance().requestInstall(this, !installRequested)) {
                ArCoreApk.InstallStatus.INSTALL_REQUESTED -> {
                    installRequested = true
                    return null
                }
                ArCoreApk.InstallStatus.INSTALLED -> Unit
            }

            val session = Session(this)
            val sizes = store.markerSizes
            val config = Config(session).apply {
                focusMode = Config.FocusMode.AUTO
                updateMode = Config.UpdateMode.LATEST_CAMERA_IMAGE
                // Plane finding and light estimation are not used by the
                // marker measurement and only cost frame time.
                planeFindingMode = Config.PlaneFindingMode.DISABLED
                lightEstimationMode = Config.LightEstimationMode.DISABLED
                augmentedImageDatabase = MarkerDatabase.build(this@MainActivity, session, sizes)
            }
            session.configure(config)
            return session
        } catch (e: UnavailableDeviceNotCompatibleException) {
            sessionError = "This device is not ARCore compatible: ${e.message}"
        } catch (e: UnavailableArcoreNotInstalledException) {
            sessionError = "Google Play Services for AR is not installed: ${e.message}"
        } catch (e: UnavailableApkTooOldException) {
            sessionError = "Google Play Services for AR is too old. Update it: ${e.message}"
        } catch (e: UnavailableSdkTooOldException) {
            sessionError = "This app's ARCore SDK is too old for the device: ${e.message}"
        } catch (e: MarkerDatabase.MarkerQualityException) {
            sessionError = e.message
        } catch (e: Exception) {
            sessionError = "AR session failed: ${e.javaClass.simpleName}: ${e.message}"
        }
        return null
    }

    override fun onArState(state: ArRenderer.ArState) {
        latestState = state
        val reading = state.reading ?: return
        val now = System.currentTimeMillis()
        if (now - lastSampleLogMs < SAMPLE_LOG_INTERVAL_MS) return
        lastSampleLogMs = now
        logger.logSample(reading, state.cameraTracking.name, store.tolerances)
    }

    // -------------------------------------------------------------- UI --

    private fun scheduleUiRefresh() {
        main.postDelayed(object : Runnable {
            override fun run() {
                refreshUi()
                main.postDelayed(this, UI_REFRESH_INTERVAL_MS)
            }
        }, UI_REFRESH_INTERVAL_MS)
    }

    private fun refreshUi() {
        val tolerances = store.tolerances
        val state = latestState
        val target = renderer.target

        statusView.text = buildString {
            val error = sessionError ?: state?.error
            if (error != null) {
                append("ERROR: ").append(error).append('\n')
            }
            append("camera ").append(state?.cameraTracking?.name ?: "STARTING")
            state?.trackingFailureReason?.let { append(" (").append(it).append(')') }
            append("  |  stand ").append(if (state?.standVisible == true) "SEEN" else "----")
            append("  |  ref ").append(
                when {
                    state?.referenceVisible == true -> "SEEN"
                    state?.referenceEverSeen == true -> "LATCHED"
                    else -> "----"
                }
            )
            append('\n')
            append("frame ").append(state?.frameMode?.name ?: "-")
            if (state?.frameMode == FrameMode.AR_WORLD) {
                append(" (session-local, scan the REF marker)")
            }
            append("  |  target ").append(
                if (target == null) "none" else "${target.frameMode.name} @ ${target.label}"
            )
            append('\n')
            append("log ").append(logger.rowCount).append(" rows")
            append("  |  trials ").append(logger.trialCount)
            append("  |  rec ").append(if (logger.recording) "ON" else "off")
        }

        poseView.text = formatPose(state?.reading)
        guidanceView.text = formatGuidance(state, tolerances)
        verdictView.text = formatVerdict(state, tolerances)
    }

    private fun formatPose(reading: Reading?): String {
        if (reading == null) return "no stand marker in view"
        val p = reading.standPose.position
        val e = reading.standPose.euler
        return String.format(
            Locale.US,
            "X %+7.1f cm   Y %+7.1f cm   Z %+7.1f cm\n" +
                "pitch %+7.2f  yaw %+7.2f  roll %+7.2f  (deg)\n" +
                "cam dist %s   ref age %s",
            p.x * M_TO_CM, p.y * M_TO_CM, p.z * M_TO_CM,
            e.pitchDeg, e.yawDeg, e.rollDeg,
            reading.cameraDistanceM?.let {
                String.format(Locale.US, "%.1f cm", it * M_TO_CM)
            } ?: "n/a",
            reading.referenceAgeMs?.let { String.format(Locale.US, "%.1f s", it / 1000f) } ?: "n/a",
        )
    }

    private fun formatGuidance(state: ArRenderer.ArState?, tolerances: Tolerances): String {
        if (state?.targetFrameMismatch == true) {
            return "Target was saved in a different frame than the current one.\n" +
                "Scan the REF marker again, or clear the target."
        }
        val delta = state?.reading?.delta ?: return "no target saved / no delta"
        return Guidance.compute(delta, tolerances).steps.joinToString("\n") { it.format() }
    }

    private fun formatVerdict(state: ArRenderer.ArState?, tolerances: Tolerances): String {
        val delta = state?.reading?.delta ?: return "---"
        val result = Guidance.compute(delta, tolerances)
        return String.format(
            Locale.US,
            "%s   err %.1f cm / %.2f deg   tol %.1f cm / %.1f deg   match %d%%",
            if (result.allInTolerance) "IN TOLERANCE" else "OUT OF TOLERANCE",
            delta.positionErrorCm,
            delta.orientationErrorDeg,
            tolerances.positionCm,
            tolerances.orientationDeg,
            result.matchPercent,
        )
    }

    // ---------------------------------------------------------- actions --

    private fun saveTarget() {
        val state = latestState
        val reading = state?.reading
        if (reading == null) {
            toast("No stand marker in view - nothing to save")
            return
        }
        if (reading.frameMode == FrameMode.AR_WORLD) {
            // Saving an AR world pose would look like it worked and then be
            // meaningless in the next session; refuse instead.
            toast("Scan the REF marker first: an AR-world pose is not reproducible")
            return
        }
        val target = ExperimentStore.SavedTarget(
            frameMode = reading.frameMode,
            transform = reading.standPose.transform,
            savedAtMs = System.currentTimeMillis(),
            label = "t${logger.trialCount}",
        )
        store.saveTarget(target)
        renderer.target = target
        logger.logEvent(
            MeasurementLogger.EventType.TARGET_SAVED,
            "target saved in ${target.frameMode.name}",
            reading,
            store.tolerances,
        )
        toast("Target saved")
        refreshUi()
    }

    private fun clearTarget() {
        store.clearTarget()
        renderer.target = null
        logger.logEvent(
            MeasurementLogger.EventType.TARGET_CLEARED,
            "target cleared",
            latestState?.reading,
            store.tolerances,
        )
        toast("Target cleared")
        refreshUi()
    }

    private fun resetReference() {
        renderer.resetReference()
        toast("Reference origin cleared - rescan the REF marker")
        refreshUi()
    }

    private fun markTrial() {
        val trial = logger.markTrial(latestState?.reading, store.tolerances, noteField.text.toString())
        noteField.setText("")
        toast("Trial $trial marked")
        refreshUi()
    }

    /**
     * Writes the operator's own measurement into the log alongside the app's,
     * without starting a new trial - typically the tape reading taken before
     * moving the stand and again once the app claims it is back in tolerance.
     */
    private fun logNote() {
        val text = noteField.text.toString().trim()
        if (text.isEmpty()) {
            toast("Type the tape reading first")
            return
        }
        logger.logEvent(
            MeasurementLogger.EventType.NOTE,
            text,
            latestState?.reading,
            store.tolerances,
        )
        noteField.setText("")
        toast("Noted in log")
        refreshUi()
    }

    private fun toggleRecording() {
        logger.setRecording(!logger.recording)
        recordButton.text = if (logger.recording) "REC ON" else "REC OFF"
        refreshUi()
    }

    private fun exportLog() {
        val export = try {
            logger.export(store.tolerances, store.markerSizes)
        } catch (e: Exception) {
            toast("Export failed: ${e.message}")
            return
        }
        toast("Exported ${export.rowCount} rows to ${export.csv.parentFile?.name}/")
        shareExport(export)
    }

    private fun shareExport(export: MeasurementLogger.Export) {
        val uris = arrayListOf<Uri>(
            FileProvider.getUriForFile(this, "$packageName.logs", export.csv),
            FileProvider.getUriForFile(this, "$packageName.logs", export.json),
        )
        val intent = Intent(Intent.ACTION_SEND_MULTIPLE).apply {
            type = "text/*"
            putParcelableArrayListExtra(Intent.EXTRA_STREAM, uris)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        runCatching { startActivity(Intent.createChooser(intent, "Export Phase 0 log")) }
            .onFailure { toast("Files written; no app available to share them") }
    }

    private fun applySetup() {
        val standCm = standWidthField.text.toString().toFloatOrNull()
        val referenceCm = referenceWidthField.text.toString().toFloatOrNull()
        val positionCm = positionToleranceField.text.toString().toFloatOrNull()
        val orientationDeg = orientationToleranceField.text.toString().toFloatOrNull()

        if (standCm == null || referenceCm == null || standCm <= 0f || referenceCm <= 0f) {
            toast("Marker widths must be positive numbers in cm")
            return
        }
        if (positionCm == null || orientationDeg == null || positionCm <= 0f || orientationDeg <= 0f) {
            toast("Tolerances must be positive numbers")
            return
        }

        store.tolerances = Tolerances(positionCm, orientationDeg)
        val newSizes = MarkerSizes(standCm / M_TO_CM, referenceCm / M_TO_CM)
        val sizesChanged = newSizes != store.markerSizes
        store.markerSizes = newSizes

        if (sizesChanged) {
            // Marker widths are baked into the augmented-image database, so the
            // session has to be rebuilt for a new width to take effect.
            renderer.session = null
            session?.close()
            session = null
            renderer.resetReference()
            startOrResumeSession()
            toast("Marker sizes applied - AR session restarted")
        } else {
            toast("Tolerances applied")
        }
        refreshUi()
    }

    private fun toast(message: String) =
        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()

    private fun fmt(value: Float) = String.format(Locale.US, "%.1f", value)

    private companion object {
        const val CAMERA_PERMISSION_REQUEST = 1001
        const val PANEL_PADDING_PX = 24
        const val UI_REFRESH_INTERVAL_MS = 100L

        /** 10 Hz keeps logs readable while still capturing settle behaviour. */
        const val SAMPLE_LOG_INTERVAL_MS = 100L
    }
}
