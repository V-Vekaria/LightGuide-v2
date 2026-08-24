"""Send a command to the board's USB serial console and print the reply.

    python device/tools/device_console.py info
    python device/tools/device_console.py wipe

`wipe` empties the setup library. It exists because the conformance suite
asserts on an empty device and the contract deliberately has no remote wipe -
a cable is the permission.
"""
import sys
import time

import serial
from serial.tools import list_ports


def find_board():
    for p in list_ports.comports():
        if "2341:0070" in (p.hwid or "").upper().replace("VID:PID=", ""):
            return p.device
        if "VID:PID=2341:0070" in (p.hwid or "").upper():
            return p.device
    return None


def main() -> int:
    cmd = (sys.argv[1] if len(sys.argv) > 1 else "info").strip()
    dev = find_board()
    if not dev:
        print("board not found (looking for 2341:0070)", file=sys.stderr)
        return 1

    with serial.Serial(dev, 115200, timeout=0.4) as port:
        time.sleep(0.3)
        port.reset_input_buffer()
        port.write((cmd + "\n").encode())
        port.flush()

        deadline = time.monotonic() + 2.5
        out = b""
        while time.monotonic() < deadline:
            out += port.read(256)
        text = out.decode("utf-8", "replace").strip()
        print(text if text else "(no reply)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
