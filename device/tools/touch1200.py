"""Reset an Arduino Nano ESP32 into its DFU bootloader.

Opening the native-USB CDC port at 1200 baud and dropping DTR is the standard
Arduino reset-to-bootloader handshake. Used when `arduino-cli upload` reports
"No DFU capable USB device available" - the board is running a sketch and has
not been kicked into the bootloader.
"""
import sys
import time

import serial

port = sys.argv[1] if len(sys.argv) > 1 else "COM10"
try:
    s = serial.Serial(port, 1200)
    s.dtr = False
    time.sleep(0.25)
    s.close()
    print(f"1200-baud touch sent to {port}")
except serial.SerialException as exc:
    print(f"touch failed on {port}: {exc}", file=sys.stderr)
    sys.exit(1)

time.sleep(2.0)
print("waited 2s for re-enumeration")
