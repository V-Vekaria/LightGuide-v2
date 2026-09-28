# Approved Android design candidate — 28 September 2026

Delivery PR: https://github.com/V-Vekaria/LightGuide-v2/pull/22

## Candidate and compatibility intent

Version 0.2.0, Android versionCode 7, package `com.lightguide.codex`.
Database remains `lightguide-guest-v1.db`, schema v2. No destructive migration.
The approved design, clickable recreation stages, retained entries, past-date
validation and elapsed-shoot grouping are implemented in the existing mobile app.
Hardware PRs #20 and #21 were not modified.

## Evidence

- TypeScript check passes.
- All 52 local tests pass, including database reopen/migration, date validation,
  backup restoration with stable identities and invalid-backup rollback.
- Web and Android JavaScript exports succeed. These are not native APK builds.
- GitHub Actions run 36362547061 for implementation commit
  `695e5bd69e69de8a6219b3738f808e531e5d6eec` failed before executing any steps.
  Android, software and positioning jobs had no assigned runner; emulator job was
  skipped. Retrying failed jobs once produced the same result.
- The connector returned no job logs (404 BlobNotFound), and does not expose the
  check annotations endpoint. The underlying account/service reason is unknown;
  do not infer billing, quota or a source compilation failure.
- Browser preview reached the app's storage error boundary: `navigator.storage
  not available (not supported by your browser or context is not secure)`.
  The preview uses HTTP on a non-loopback host, while the database requires a
  secure browser context. No browser security settings or persistence code were
  weakened. Rendered-screen and browser workflow verification remain pending.
- Local environment has no Android SDK/adb, so it cannot substitute for the
  native build and emulator gates.

## Outstanding delivery gates

1. Inspect the failed run's GitHub check annotations and restore runner execution.
2. Run software/browser regressions and native build at the latest PR head.
3. Verify fresh installation and in-place update against the previous APK, retaining
   saved setups, photos and recreation identity. Record package, version, signing
   certificate, source SHA and delivered APK SHA-256.
4. Review actual phone-size screenshots against the approved design, fix any
   differences, then provide the verified APK. Physical phone/hardware behavior
   remains unverified until tested on the user's device.

No updated APK is ready for distribution. Keep this PR in draft until these gates
pass; do not label the browser export as an installable Android app.
