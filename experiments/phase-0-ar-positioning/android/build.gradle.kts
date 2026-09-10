plugins {
    id("com.android.application") version "9.3.2" apply false
}

// OneDrive's sync agent keeps file handles open inside the folders it syncs.
// Gradle's incremental resource tasks delete and recreate their output
// directories on every run, so on a synced checkout the build fails at random
// with AccessDeniedException / "Unable to delete directory". Moving only the
// build outputs outside the synced tree removes the contention; the source
// stays where it is.
//
// No-op for a checkout outside OneDrive, which keeps the usual ./build layout.
val syncedCheckout = rootDir.absolutePath.contains("OneDrive", ignoreCase = true)

if (syncedCheckout) {
    val buildRoot = File(System.getProperty("java.io.tmpdir"), "lightguide-phase0-build")
    layout.buildDirectory.set(File(buildRoot, "root"))
    subprojects {
        layout.buildDirectory.set(File(buildRoot, name))
    }

    gradle.projectsEvaluated {
        logger.lifecycle("Build outputs redirected outside OneDrive: $buildRoot")
    }
}
