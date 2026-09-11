# Codex Android validation retry — 11 September 2026

Source checked: `10fd59af5a7cef4a4f39ef1415c7f49bb41d8383`.
Run: https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34560958960

The Android release build succeeded. Artifact `lightguide-codex-android`, ID
`10185524339`, was downloaded and its ZIP checksum matched GitHub's digest:
`6940a2443cbefcb1529b92d9beb79fc29f6917a0d994ae963f5fd2039dff9ba3`.
It contains an actual 66,337,730-byte `app-release.apk`, SHA-256
`2fecfed76223bdd4159f6a9d4000172143e5949ec2ca8457a158d8c77f8760c0`.

The emulator image installation failed with `No space left on device` before
the smoke script ran. No installation, launch or persistence test passed in
that run. The separate positioning build failed on a duplicate `@Volatile`
annotation in MainActivity.kt.

This retry moves Android smoke testing to a fresh runner that downloads the
APK produced by the same workflow run. The APK keeps artifact name
`lightguide-codex-android`; screenshots, UI, logcat and step/checksum evidence
are uploaded separately as `codex-android-smoke-evidence`. The smoke script
records source revision, package, APK checksum and completed steps. It checks
that force-stop actually terminated the app before the offline reopen.
The duplicated Kotlin annotation is removed on the Codex branch only.

Retry outcome: pending CI. Inspect build and smoke jobs, download the APK,
compare its checksum with smoke evidence and verify every required step before
declaring phone-test readiness. Physical camera, AR accuracy, BLE and sensors
still require devices; no 3 cm accuracy claim follows from emulator tests.
