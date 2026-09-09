# Legacy Nano ESP32 firmware

This directory is the earlier Arduino Nano ESP32 + HC-SR04/LDR prototype using Wi-Fi SoftAP, HTTP and WebSocket. It is preserved for reuse and regression testing, not as the current mobile/BLE product.

Start new work with [the root handoff](../CLAUDE.md) and [current hardware BOM](../docs/V1_BOM.md). For explicit legacy maintenance read [AGENTS.md](AGENTS.md) and [STATUS.md](STATUS.md).

The [M5 report](reports/M5_conformance_acceptance.md) records 21/21 legacy hardware-contract tests on 24 August 2026. Firmware source exists in [firmware/05_integration/](firmware/05_integration/README.md); the old "skeleton/no firmware" statement was obsolete. No new test run is claimed.

## Retained engineering material

- [Board records](docs/00-BOARD.md): historic Nano-specific wiring/toolchain evidence, not N8R8 instructions.
- [API notes](docs/01-API-CONTRACT.md): legacy compatibility context.
- [Firmware index](firmware/README.md): old probes and integration.
- [Run notes](RUN.md): legacy commands; verify actual device before use.
- [Reports](reports/M5_conformance_acceptance.md): recorded acceptance evidence.

Old milestone/open-decision notes are historical. They must not restart completed work or override the new architecture.
