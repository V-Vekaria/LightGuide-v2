# M0 — Board probe: **PASS** (with one inconclusive result)

**Date:** 20 August 2026
**Sketch:** `firmware/00_board_probe/00_board_probe.ino`
**Flashed via:** `arduino-cli upload` over DFU — first flash after registering `nanoesp32.inf`

---

## Chip

| | |
|---|---|
| Model | **ESP32-S3 rev 0**, 2 cores @ 240 MHz |
| MAC | `20:6E:F1:31:3B:04` |
| SDK | `v4.4.7-dirty` |
| Flash | **16 MB** |
| Heap | 346,692 total / 276,372 free |
| **PSRAM** | **8 MB** (8,385,975 bytes), 8,371,735 free |

8 MB of PSRAM is far more headroom than this design needs. Memory will not be a
constraint anywhere in M1–M5.

## Partitions

```
nvs        0x00009000     20,480
otadata    0x0000e000      8,192
app0       0x00010000  3,145,728
app1       0x00310000  3,145,728
ffat       0x00610000  9,830,400
factory    0x00f70000    524,288
coredump   0x00ff0000     65,536
```

Two findings that matter:

- **`ffat` is 9.375 MB.** The v2 bundle is 15.89 KB gzipped against a 50 KB budget, so
  storage for the app and the whole setup library is a non-issue — roughly 600× headroom.
- **`app0` + `app1` + `otadata` means OTA is available.** Once M3 brings up the HTTP
  server, firmware updates can go over Wi-Fi. Worth considering before M4/M5, since it
  would remove USB flashing from the loop entirely.

## I²C bus — clean

```
0x3C  <- SSD1306 OLED
1 device(s).
```

Only the display. Nothing unexpected, and it re-confirms M0b independently.

## ⚠️ ADC / Wi-Fi coexistence — **inconclusive, not a failure**

```
A0 before SoftAP : 3994
A0 after  SoftAP : 122   (AP up)
A0 live          : 153
```

The reading collapsed once SoftAP started, which *looks* alarming. It is not
interpretable, because **nothing is connected to A0** — the LDR is not wired yet, so the
pin is floating and a floating high-impedance input may read anything.

**The evidence points to no ADC2 conflict**, on this reasoning: when `analogRead` hits an
ADC2 channel while Wi-Fi is up, ESP-IDF fails the conversion and Arduino returns a
constant `0`. We got `122` then `153` — non-zero and *varying*, i.e. the converter is
still running and producing fresh samples. That is ADC1 behaviour.

**This must be re-tested in M1 with a real signal on the pin** (the LDR divider, or simply
a jumper to `3V3` or `GND`). The before/after pair should then agree. Until that is done,
the ADC1 conclusion is inference, not measurement.

Recorded because it is exactly the kind of result that gets misremembered later as
"we checked the ADC and it was fine."

## Acceptance

| Criterion | Result |
|---|---|
| Chip identity reported | ✅ |
| Flash + partition table reported | ✅ |
| PSRAM reported | ✅ 8 MB |
| I²C scan | ✅ display only |
| ADC survives SoftAP | ⚠️ **inconclusive — floating pin.** Re-test in M1 |
