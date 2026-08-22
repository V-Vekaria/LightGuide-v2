"""Listen to the board's serial output.

A fallback for when `arduino-cli monitor` is awkward about holding the port.
Toggles DTR on open so a sketch that waits for a host is nudged into starting.

    python tools/sniff_serial.py                  # COM10, 115200, 6s
    python tools/sniff_serial.py --seconds 30     # longer listen
    python tools/sniff_serial.py --port COM7      # different port
"""
import argparse
import sys
import time

try:
    import serial
except ImportError:
    sys.exit("pyserial missing:  python -m pip install pyserial")


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument("--port", default="COM10")
    ap.add_argument("--baud", type=int, default=115200)
    ap.add_argument("--seconds", type=float, default=6.0)
    args = ap.parse_args()

    try:
        port = serial.Serial(args.port, args.baud, timeout=0.5)
    except serial.SerialException as exc:
        # Almost always: the board is unplugged, or a monitor already holds the port.
        print(f"could not open {args.port}: {exc}", file=sys.stderr)
        return 1

    with port:
        print(f"{args.port} @ {args.baud} - listening {args.seconds:g}s")
        port.dtr = False
        time.sleep(0.1)
        port.dtr = True

        deadline = time.monotonic() + args.seconds
        seen = False
        while time.monotonic() < deadline:
            chunk = port.read(512)
            if chunk:
                seen = True
                sys.stdout.write(chunk.decode("utf-8", "replace"))
                sys.stdout.flush()

    if not seen:
        # Not a fault on a factory board - the stock sketch prints nothing.
        print("\n-- silent: no bytes received --")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
