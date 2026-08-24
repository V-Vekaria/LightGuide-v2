"""Follow a native-USB board across resets, catching output from the first byte.

Why this exists alongside sniff_serial.py:

The Nano ESP32's serial port IS the USB device. Every reset makes the port
disappear and come back a moment later, so a tool that opens the port once and
reads is holding a dead handle the instant the board reboots - and the boot
messages, the only ones that matter when something crashes in setup(), are
printed before it could possibly reattach.

This polls for the port instead, opens it the moment it appears, and reopens it
after every disappearance. On a board stuck in a reset loop that means you see
each boot attempt rather than nothing at all.

    python device/tools/watch_serial.py                 # follow until Ctrl-C
    python device/tools/watch_serial.py --seconds 60    # bounded, for scripts
"""

import argparse
import sys
import time

try:
    import serial
    from serial.tools import list_ports
except ImportError:
    sys.exit("pyserial missing:  python -m pip install pyserial")

# The Nano ESP32 running a sketch. ROM download mode is 303A:1001 instead.
DEFAULT_VIDPID = "2341:0070"


def find_port(vidpid: str):
    want = vidpid.upper()
    for p in list_ports.comports():
        if want in (p.hwid or "").upper():
            return p.device
    return None


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--vidpid", default=DEFAULT_VIDPID)
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--seconds", type=float, default=0.0, help="0 = until Ctrl-C")
    args = ap.parse_args()

    end = time.monotonic() + args.seconds if args.seconds else None
    print(f"watching for {args.vidpid} - reset the board now", flush=True)

    boots = 0
    while end is None or time.monotonic() < end:
        dev = find_port(args.vidpid)
        if not dev:
            time.sleep(0.05)          # tight: the reappear window is short
            continue

        try:
            port = serial.Serial(dev, args.baud, timeout=0.2)
        except serial.SerialException:
            # Enumerated but not ready to open yet - normal, retry.
            time.sleep(0.05)
            continue

        boots += 1
        print(f"\n--- {dev} opened (attach #{boots}) ---", flush=True)
        try:
            while end is None or time.monotonic() < end:
                chunk = port.read(512)
                if chunk:
                    sys.stdout.write(chunk.decode("utf-8", "replace"))
                    sys.stdout.flush()
        except serial.SerialException:
            print("\n--- port vanished (board reset) ---", flush=True)
        finally:
            try:
                port.close()
            except Exception:
                pass

    print(f"\ndone - {boots} attach(es)")
    # More than a couple of attaches in a short window IS the diagnosis.
    if boots > 2:
        print("the board is resetting repeatedly - it is in a boot loop")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except KeyboardInterrupt:
        pass
