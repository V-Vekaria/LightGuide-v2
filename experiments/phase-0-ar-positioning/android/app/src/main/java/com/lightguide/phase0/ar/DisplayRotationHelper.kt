package com.lightguide.phase0.ar

import android.content.Context
import android.hardware.display.DisplayManager
import android.view.Display
import android.view.WindowManager
import com.google.ar.core.Session

/**
 * Keeps the ARCore session's display geometry in step with the device.
 *
 * ARCore needs the current viewport size and display rotation to map camera
 * pixels onto the screen; without this the preview is stretched or rotated and
 * the tap-to-screen mapping is wrong.
 */
class DisplayRotationHelper(context: Context) : DisplayManager.DisplayListener {

    private val displayManager =
        context.getSystemService(Context.DISPLAY_SERVICE) as DisplayManager

    @Suppress("DEPRECATION")
    private val display: Display =
        (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay

    private var viewportChanged = false
    private var viewportWidth = 0
    private var viewportHeight = 0

    fun onResume() = displayManager.registerDisplayListener(this, null)

    fun onPause() = displayManager.unregisterDisplayListener(this)

    fun onSurfaceChanged(width: Int, height: Int) {
        viewportWidth = width
        viewportHeight = height
        viewportChanged = true
    }

    /** Call once per frame on the GL thread, before `session.update()`. */
    fun updateSessionIfNeeded(session: Session) {
        if (!viewportChanged) return
        session.setDisplayGeometry(display.rotation, viewportWidth, viewportHeight)
        viewportChanged = false
    }

    override fun onDisplayAdded(displayId: Int) = Unit

    override fun onDisplayRemoved(displayId: Int) = Unit

    override fun onDisplayChanged(displayId: Int) {
        viewportChanged = true
    }
}
