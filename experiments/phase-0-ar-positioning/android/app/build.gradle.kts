plugins {
    // AGP 9 has built-in Kotlin support; the separate kotlin-android plugin is
    // no longer applied (and is rejected if it is).
    id("com.android.application")
}

android {
    namespace = "com.lightguide.phase0"
    // No API 37 calls are used; compile against the available stable SDK.
    compileSdk = 36

    defaultConfig {
        applicationId = "com.lightguide.codex.phase0"
        minSdk = 24 // ARCore's floor
        targetSdk = 36
        versionCode = 1
        versionName = "0.1-phase0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    packaging {
        resources.excludes += "/META-INF/{AL2.0,LGPL2.1}"
    }
}

dependencies {
    implementation("com.google.ar:core:1.54.0")
    // Only for FileProvider, used to hand exported logs to another app.
    implementation("androidx.core:core:1.13.1")

    testImplementation("junit:junit:4.13.2")
}
