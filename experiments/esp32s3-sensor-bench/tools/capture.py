"""
LightGuide sensor bench - data capture.

Records the AllSensors_Live CSV stream ("H," header and "D," rows) to one CSV per
run. The save button doubles as a "measure now" marker: the `saves` column counts
presses, so tools/plot_bench.py can cut the recording into one segment per press.

Opening the port resets the board, so the capture waits for the firmware's header
line (about 6 s while the ToF firmware uploads) before recording.

A USB drop (a cable tugged on a stand) does not end the run: the port is reopened,
which resets the board and its press counter, so two columns are added in front of
the firmware's own: `t_host_s` (seconds on the PC clock since recording began) and
`saves_total` (presses carried across reconnects). The plots use those two.

Usage:
    python tools/capture.py --name tof_distance --presses 8
    python tools/capture.py --name imu_still --seconds 60
"""

from __future__ import annotations

import argparse
import csv
import sys
import time
from datetime import datetime
from pathlib import Path

try:
    import serial
except ImportError:
    sys.exit("pyserial is not installed. Run: pip install pyserial")

BAUD = 115200
DATA_DIR = Path(__file__).resolve().parent.parent / "data"
TAIL_S = 6.0  # keep recording after the last press so its hold window is complete
RECONNECT_S = 60.0


def reopen(port: str) -> serial.Serial | None:
    deadline = time.time() + RECONNECT_S
    while time.time() < deadline:
        try:
            return serial.Serial(port, BAUD, timeout=1)
        except serial.SerialException:
            time.sleep(1.0)
    return None


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--port", default="COM5")
    ap.add_argument("--name", required=True, help="test name, used in the file name")
    ap.add_argument("--presses", type=int, default=0,
                    help="stop TAIL_S seconds after this many button presses")
    ap.add_argument("--seconds", type=float, default=0, help="or record for a fixed time")
    ap.add_argument("--tail", type=float, default=TAIL_S,
                    help="seconds to keep recording after the last press")
    ap.add_argument("--max-seconds", type=float, default=900, help="safety limit")
    args = ap.parse_args()
    if not args.presses and not args.seconds:
        sys.exit("give --presses or --seconds")

    DATA_DIR.mkdir(parents=True, exist_ok=True)
    out = DATA_DIR / f"{datetime.now():%Y%m%d_%H%M%S}_{args.name}.csv"

    ser = serial.Serial(args.port, BAUD, timeout=1)
    header: list[str] | None = None
    rows = 0
    events: list[str] = []
    t_start = time.time()
    t_stop: float | None = None
    record_start: float | None = None
    last_report = 0.0
    saves_offset = 0   # presses from before the last reconnect
    board_saves = 0    # latest press count reported by the board
    presses = 0

    with out.open("w", newline="") as fh:
        writer = csv.writer(fh)
        while True:
            now = time.time()
            if now - t_start > args.max_seconds:
                print("safety limit reached")
                break
            if t_stop is not None and now >= t_stop:
                break

            try:
                line = ser.readline().decode("ascii", errors="replace").strip()
            except serial.SerialException:
                print(f"USB connection lost after {presses} presses - reconnecting...", flush=True)
                ser.close()
                ser = reopen(args.port)
                if ser is None:
                    print(f"could not reconnect within {RECONNECT_S:.0f} s; stopping")
                    break
                saves_offset += board_saves  # the board restarts its count from 0
                board_saves = 0
                print("reconnected; waiting for the board to restart", flush=True)
                continue
            if not line:
                continue

            if line.startswith("H,"):
                cols = line.split(",")[1:]
                if header is None:
                    header = cols
                    writer.writerow(["t_host_s", "saves_total"] + header)
                    record_start = now
                    if args.seconds:
                        t_stop = now + args.seconds
                    print(f"recording -> {out.name} ({len(header)} columns)", flush=True)
                elif cols != header:
                    print("firmware header changed mid-run; stopping")
                    break
                continue

            if line.startswith("EVENT") or "FAILED" in line or "init" in line:
                events.append(line)
                print(line, flush=True)

            if header is None or not line.startswith("D,"):
                continue
            fields = line.split(",")[1:]
            if len(fields) != len(header):
                continue  # a line torn by the port opening mid-row
            board_saves = int(fields[header.index("saves")])
            presses = saves_offset + board_saves
            writer.writerow([f"{now - record_start:.3f}", presses] + fields)
            fh.flush()  # keep what was recorded if the run is interrupted
            rows += 1

            if args.presses and presses >= args.presses and t_stop is None:
                t_stop = now + args.tail
                print(f"press {presses}/{args.presses} seen, finishing in {args.tail:.0f} s", flush=True)
            if now - last_report > 10:
                last_report = now
                print(f"  {now - record_start:5.0f} s  rows {rows}  presses {presses}", flush=True)

    ser.close()
    print(f"saved {rows} rows to {out}")
    if rows == 0:
        sys.exit("no data rows recorded - is AllSensors_Live flashed and COM5 free?")


if __name__ == "__main__":
    main()
