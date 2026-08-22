"""Flash a sketch to the Nano ESP32 over the ESP32-S3 ROM bootloader.

Why this exists: `arduino-cli upload` for `arduino:esp32:nano_nora` only speaks
DFU, and on this machine Windows has no driver bound to the board's DFU
interface (ConfigManagerErrorCode 28) - see docs/00-BOARD.md 5. The ROM
bootloader enumerates as a plain USB-serial device (VID 303A) that Windows
drives with its inbox driver, so this path needs no driver install.

Put the board in ROM download mode first:
    hold B1 (BOOT), tap RESET, release B1

Then:
    python tools/flash_rom.py 00b_display_test
    python tools/flash_rom.py 00b_display_test --port COM12

Offsets and flash params are taken from the core's own esptool recipe
(platform.txt tools.esptool_py.upload.pattern_args) so they stay in step with
what a normal upload would have written.
"""
import argparse
import pathlib
import subprocess
import sys

ARDUINO15 = pathlib.Path.home() / "AppData/Local/Arduino15/packages"
ESPTOOL = ARDUINO15 / "esp32/tools/esptool_py/4.5.1/esptool.exe"
PLATFORM = ARDUINO15 / "arduino/hardware/esp32/2.0.18-arduino.5"
BOOT_APP0 = PLATFORM / "tools/partitions/boot_app0.bin"

FQBN_DIR = "arduino.esp32.nano_nora"
FLASH_MODE, FLASH_FREQ, FLASH_SIZE = "dio", "80m", "16MB"


def rom_ports():
    """COM ports belonging to an ESP32-S3 in ROM download mode (VID 303A)."""
    try:
        from serial.tools import list_ports
    except ImportError:
        return []
    return [p.device for p in list_ports.comports() if "VID:PID=303A" in (p.hwid or "").upper()]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("sketch", help="sketch dir under firmware/, e.g. 00b_display_test")
    ap.add_argument("--port", help="override; default is the auto-detected ROM port")
    ap.add_argument("--baud", default="921600")
    ap.add_argument("--after", default="hard_reset", choices=["hard_reset", "no_reset"],
                    help="no_reset leaves the board in download mode - use when the "
                         "B1 jumper is still fitted, so the reset does not just re-enter it")
    args = ap.parse_args()

    build = pathlib.Path("firmware") / args.sketch / "build" / FQBN_DIR
    # Artifacts keep the .ino in the name: <sketch>.ino.bootloader.bin etc.
    # (do NOT use with_suffix here - it would replace .ino instead of appending)
    def art(ext):
        return build / f"{args.sketch}.ino{ext}"

    parts = [
        ("0x0", art(".bootloader.bin")),
        ("0x8000", art(".partitions.bin")),
        ("0xe000", BOOT_APP0),
        ("0x10000", art(".bin")),
    ]

    if not ESPTOOL.exists():
        print(f"esptool not found at {ESPTOOL}", file=sys.stderr)
        return 1
    missing = [str(f) for _, f in parts if not f.exists()]
    if missing:
        print("missing build output:", *missing, sep="\n  ", file=sys.stderr)
        print(f"\nbuild first:\n  arduino-cli compile --fqbn arduino:esp32:nano_nora "
              f"--export-binaries firmware/{args.sketch}", file=sys.stderr)
        return 1

    port = args.port
    if not port:
        found = rom_ports()
        if not found:
            print("No ESP32-S3 ROM device (VID 303A) found.", file=sys.stderr)
            print("Put the board in download mode: hold B1 (BOOT), tap RESET, "
                  "release B1 - then re-run.", file=sys.stderr)
            return 1
        port = found[0]
        print(f"ROM bootloader detected on {port}")

    cmd = [
        str(ESPTOOL), "--chip", "esp32s3", "--port", port, "--baud", args.baud,
        "--before", "default_reset", "--after", args.after, "write_flash",
        "-z", "--flash_mode", FLASH_MODE, "--flash_freq", FLASH_FREQ,
        "--flash_size", FLASH_SIZE,
    ]
    for offset, f in parts:
        cmd += [offset, str(f)]

    print(" ".join(cmd), "\n")
    return subprocess.call(cmd)


if __name__ == "__main__":
    raise SystemExit(main())
