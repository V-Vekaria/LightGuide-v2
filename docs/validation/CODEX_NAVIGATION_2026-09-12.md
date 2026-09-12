# Repeated navigation repair — 12 September 2026

User reports that the previous nine phone checks passed without observed errors, but repeated Settings taps require repeated Back actions. Recording 96009.mp4 shows repeated Settings transitions. Source at d973d813158c confirms the shared header pushes a new Settings route on every tap, including from Settings itself.

Changes for 0.1.2 (Android versionCode 3):
- Use navigate for Settings and disable the header action while already on Settings. Rapid pre-transition requests reuse the destination instead of pushing duplicates.
- Bottom tabs update the existing route parameters; reselecting the current tab does nothing, retaining search state. Create uses navigate.
- Six browser regressions cover Settings from four main tabs, rapid taps from an unfinished capture, and inventory search retention.
- Android smoke now checks four extra Settings taps followed by one hardware Back and one on-screen Back in separate cycles.

Verification: TypeScript and web export pass. All 15 browser workflows pass, including the six new navigation cases. Python smoke script compiles. Android build and the new native navigation checks remain pending CI; no updated APK is declared verified by this report. No storage schema or package identity changes.
