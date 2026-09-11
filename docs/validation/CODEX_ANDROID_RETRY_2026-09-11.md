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

## Fresh-runner result and install-timeout correction

Run https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34572000144 at
`94bb0caf4c88c310ca0db9fa022c6407e8378af9` passed software checks, Android
release compilation, and positioning JVM tests/debug compilation. The fresh
emulator runner booted and downloaded the same-run APK successfully.

The smoke test stopped at `adb install` after its 30-second subprocess limit.
Downloaded evidence has no completed checks. Logcat records the Codex package
and an applied installer session near that cutoff; this does not prove the
complete install/launch journey passed. The test now gives installation 180
seconds, requires installer `Success`, verifies `pm path com.lightguide.codex`,
and allows activity startup 90 seconds. Ordinary adb commands retain the
30-second bound. Exceptions and available diagnostics are preserved.

Runtime readiness is still pending the corrected test; no check is waived.

## 11 September: save/reopen pass; stale recreation accessibility tree

Run https://github.com/V-Vekaria/LightGuide-v2/actions/runs/34606894914,
attempt 1, source `e59aecc478721cd38c0b6bceeffa582a71595419`:
software, Android compilation and positioning jobs passed. Android smoke logs
and downloaded artifact 10267239900 evidence.json confirm install, launch,
setup name entry, save, force-close and offline reopen passed for
`com.lightguide.codex`. Evidence APK SHA256:
`3d3b84c4db5b1cff6daa9495b77cf63091db7c1f8f80e080df5a8bc077168dda`.
This iteration downloaded the evidence ZIP, not the APK; no final checksum
comparison or readiness claim is made.

Recreation failed finding `Mark step complete`. The final screenshot shows
the recreation form (Finish disabled), but latest-ui.xml still describes the
previous setup-detail screen. Logcat shows repeated UIAutomator launches
about 13 seconds apart. The recreation timer updates visible seconds each
second, consistent with UIAutomator never reaching idle. The old script
ignored dump output and read the previous XML even if a dump wrote nothing.
There is no result.txt success file in the failed evidence archive.

Bounded repair: preserve full-resolution active timing and per-second durable
recording, but update the visible elapsed minute only when it changes. The
test deletes old device XML before each dump, requires explicit dump success,
retries at most three times and records dump output. Each of the four manual
steps must now show its expected progress and the final Steps completed state.
No acceptance gate, identity, security check or measured-match rule is removed.

Local validation: Python compilation passed; three mocked dump tests passed
(fresh success, stale-file rejection, transient failure/recovery). Native
recreation and full CI for this repair remain pending. Physical camera/AR,
BLE, sensors and ±3 cm accuracy remain untested.
