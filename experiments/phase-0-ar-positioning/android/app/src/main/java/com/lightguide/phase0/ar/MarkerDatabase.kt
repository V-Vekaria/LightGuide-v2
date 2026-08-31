package com.lightguide.phase0.ar

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import com.google.ar.core.AugmentedImageDatabase
import com.google.ar.core.Session
import com.lightguide.phase0.pose.MarkerRole
import com.lightguide.phase0.pose.MarkerSizes

/**
 * Builds the augmented-image database from the printed markers in `assets`.
 *
 * The width passed with each image is the *physical printed* width. ARCore
 * uses it to fix the scale of the estimated pose, so it must match the paper,
 * not the design intent - see markers/PRINTING.md.
 */
object MarkerDatabase {

    class MarkerQualityException(val markerName: String, cause: Throwable) :
        RuntimeException("ARCore rejected marker '$markerName': ${cause.message}", cause)

    fun build(context: Context, session: Session, sizes: MarkerSizes): AugmentedImageDatabase {
        val database = AugmentedImageDatabase(session)
        add(context, database, MarkerRole.STAND, sizes.standWidthM)
        add(context, database, MarkerRole.REFERENCE, sizes.referenceWidthM)
        return database
    }

    private fun add(
        context: Context,
        database: AugmentedImageDatabase,
        role: MarkerRole,
        widthMetres: Float,
    ) {
        val bitmap = loadBitmap(context, "markers/${role.imageName}.png")
        try {
            database.addImage(role.imageName, bitmap, widthMetres)
        } catch (t: Throwable) {
            throw MarkerQualityException(role.imageName, t)
        }
    }

    /**
     * The markers are 8-bit greyscale PNGs, which BitmapFactory may decode into
     * a config ARCore will not accept, so the result is forced to ARGB_8888.
     */
    private fun loadBitmap(context: Context, assetPath: String): Bitmap {
        val options = BitmapFactory.Options().apply {
            inPreferredConfig = Bitmap.Config.ARGB_8888
            inScaled = false
        }
        val decoded = context.assets.open(assetPath).use { stream ->
            BitmapFactory.decodeStream(stream, null, options)
                ?: error("could not decode marker asset $assetPath")
        }
        return if (decoded.config == Bitmap.Config.ARGB_8888) {
            decoded
        } else {
            decoded.copy(Bitmap.Config.ARGB_8888, false)
                ?: error("could not convert marker asset $assetPath to ARGB_8888")
        }
    }
}
