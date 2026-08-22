# RUN — every command, in order

Paths assume this folder is the working directory.
`$CLI` below is `C:\Users\vishn\Downloads\arduino-cli_1.5.1_Windows_64bit\arduino-cli.exe`.

---

## 0. One-time setup

Install the ESP32 core (**~1 GB**, not yet installed):

```bash
arduino-cli core install arduino:esp32
```

Verify it landed:

```bash
arduino-cli core list
```

## 1. Is the board there?

```bash
arduino-cli board list
```

Expect `COM10 · Arduino Nano ESP32 · arduino:esp32:nano_nora`.

## 2. Compile and upload a milestone

```bash
arduino-cli compile --fqbn arduino:esp32:nano_nora firmware/00_board_probe
```

```bash
arduino-cli upload -p COM10 --fqbn arduino:esp32:nano_nora firmware/00_board_probe
```

## 3. Watch serial output

```bash
arduino-cli monitor -p COM10 -c baudrate=115200
```

Or, if the port is being awkward, the host-side sniffer:

```bash
python tools/sniff_serial.py
```

## 4. Run the app against the real board

Build the v2 bundle, then serve it from the board (milestone 3 onward):

```bash
cd .. && npm run build
```

Until milestone 3 exists, the app runs against the mock instead:

```bash
cd .. && npm run mock
```

```bash
cd .. && npm run dev
```

---

## Troubleshooting

### `No DFU capable USB device available` on upload

Windows has no driver bound to the board's DFU interface. Full diagnosis in
`docs/00-BOARD.md` §5. In order of effort:

1. **Replug the board**, then **double-tap the white RESET button** (two quick presses —
   the green LED should breathe). Upload immediately while it is in bootloader mode.
2. Install **Arduino IDE 2.x**, which registers the Nano ESP32 DFU driver permanently.
3. Flash over the ROM bootloader with `tools/flash_rom.py` — **this is the working
   route on this machine**, see below.

### Flashing without the DFU driver

The ESP32-S3 ROM bootloader enumerates as a plain USB-serial device (VID `303A`) that
Windows drives with its inbox driver, so this path needs no driver install.

Put the board in download mode — **hold `B1` (BOOT), tap `RESET`, release `B1`** — then:

```bash
python tools/flash_rom.py 00b_display_test
```

It auto-detects the ROM port, and refuses with a clear message if the board is not in
download mode. Build first if the binaries are stale:

```bash
arduino-cli compile --fqbn arduino:esp32:nano_nora --export-binaries firmware/00b_display_test
```

Offsets (`0x0` bootloader, `0x8000` partitions, `0xe000` boot_app0, `0x10000` app) and
flash params are lifted from the core's own esptool recipe, so this writes the same layout
a normal upload would.

### Double-tapping RESET does **not** help on this board

The Nano ESP32 exposes its DFU interface *continuously*, alongside the running sketch's
CDC port — both are interfaces of one composite device. There is no DFU mode to enter, so
no button sequence creates one. If the DFU driver is missing, it is missing whatever you
press. Use the ROM path above, or install the driver.

Check which interface Windows is unhappy with:

```bash
powershell -c "Get-CimInstance Win32_PnPEntity | Where-Object { $_.DeviceID -like '*VID_2341*' } | Select-Object Name,Status,ConfigManagerErrorCode | Format-List"
```

`ConfigManagerErrorCode 28` on **Arduino DFU** means *drivers not installed*.

### COM port stops opening after a failed upload

A failed `dfu-util` attempt can leave the composite device wedged — Device Manager still
reports the COM port as OK, but opening it fails with *"a device attached to the system is
not functioning"*. **Unplug and replug the board.** Nothing is damaged.
