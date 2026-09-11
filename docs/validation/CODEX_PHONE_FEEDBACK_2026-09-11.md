# Phone feedback repair — 11 September 2026

User screenshots show Home overlap, a photo ENOENT error, and unclear equipment records.

- Home: retains the phone-width natural-height stack introduced in 57db8a0. Browser geometry checks cover workspace followed by recently saved and an in-progress recreation card at 393 × 852.
- Native photos: installed Expo filesystem defines copy/move as asynchronous. Await both copies and the final move before reading/registering the image. Previously the read raced the temporary copy, consistent with the reported cache-path ENOENT. Failed saves show actionable text instead of a filesystem stack trace.
- Equipment: explain one record per physical item and selection during capture; label names explicitly; give reflector/lens examples; add name/manufacturer/model search and category filtering. Existing records are preserved. Numeric names are not quantities or readings. No live connectivity is added.

Validation: TypeScript check and web export passed. Three native-pipeline tests using delayed filesystem doubles pass (copy/move completion before registration and rollback on copy/move failure). Two focused browser checks pass (Home geometry and equipment search/filter workflow).

Initial full browser suite using the local single-process Chromium fallback was not a clean pass: two context-launch failures and an existing journey failure. The focused rerun with normal multiprocess flags passes. This is not a full-suite or physical Android pass. Native gallery/camera selection, image retention across restart and the rebuilt APK still require verification. The installed APK has not been updated by these source changes.

The preceding layout-only CI run 34641079372 compiled both APKs and passed software checks. Its Android smoke test failed to locate Save a setup. Downloaded evidence shows a system “Pixel Launcher isn't responding” dialog obscuring LightGuide; this is not evidence of an app layout failure. The new commit must rerun the existing native gate.
