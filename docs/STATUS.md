# LightGuide v2 — Current Status

**Status:** Planning baseline ready for bounded implementation; physical validation remains open.
**Current application milestone:** [Phase-0 Android positioning experiment](../experiments/phase-0-ar-positioning/README.md).

## Agreed and documented

- Measure → Save → Recreate; Android first; offline core; one-node validation.
- Native Kotlin/ARCore feasibility experiment, then conditional React Native/Expo application direction.
- Evaluation kit and purchase-verification boundaries in [V1_BOM.md](V1_BOM.md).
- Seven-table logical model, [schema](product/DATABASE_SCHEMA.md) and [sync specification](product/OFFLINE_SYNC.md).
- ±3 cm distance/height matching defaults, distinct from measurement uncertainty and the broader feasibility screen.

## Not yet established

- Passing Phase-0 position/relocalisation evidence. At this documentation audit the experiment folder contains its README, not a built Android app.
- Verified exact received sensor variants, new-board pin map and combined sensor performance.
- New-node BLE implementation, complete GATT/security/message contract or end-to-end tests.
- Implemented/migrated cloud database and tested offline sync.
- iOS implementation or physical iPhone tests.
- Final production electronics, power/enclosure design or market validation.

## Next work

Application: build the small native AR experiment, then measure it against [TEST_PLAN.md](TEST_PLAN.md).
Hardware, when requested: verify the evaluation board and each received sensor independently using the BOM bring-up checklist; keep the resulting bench work separate from legacy firmware.
Integrate after the positioning gate produces evidence. Do not expand the whole backend/UI before the core feasibility question is answered.

## Existing code and evidence

The root Preact application, mock-device and Nano ESP32 firmware are legacy engineering. The [24 August report](../device/reports/M5_conformance_acceptance.md) records 21/21 legacy hardware-contract tests; this is not a new test run or proof of new-node BLE/AR functionality.

Old app/firmware handovers and plans are [archived](archive/legacy-companion/README.md). Their dated "next task", port, flash and milestone statements are not current instructions.

Update this page after implementation changes. Keep test claims tied to dated evidence in [the validation log](validation/VALIDATION_LOG.md).
