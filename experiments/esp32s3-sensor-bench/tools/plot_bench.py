"""
LightGuide sensor bench - figures from capture.py recordings.

Each button press marks one measurement step. The hold window runs from HOLD_START
to HOLD_END seconds after the press, so the hand that pressed the button is clear
and the rig has settled.

Usage:
    python tools/plot_bench.py tof data/<run>.csv --truth-cm 10,20,30,50,75,100,150,200
"""

from __future__ import annotations

import argparse
import csv
import sys
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt
import numpy as np

FIG_DIR = Path(__file__).resolve().parent.parent / "figures"
HOLD_START, HOLD_END = 1.0, 4.0  # seconds after each press
APP_TOLERANCE_MM = 30            # the app's +/-3 cm distance tolerance
BLUE, ORANGE, GREEN, PINK, YELLOW = "#0072B2", "#D55E00", "#009E73", "#CC79A7", "#E69F00"

plt.rcParams.update({
    "figure.dpi": 150,
    "axes.spines.top": False,
    "axes.spines.right": False,
    "axes.grid": True,
    "grid.alpha": 0.3,
    "axes.titleweight": "bold",
})


def load(path: Path) -> dict[str, np.ndarray]:
    with path.open() as fh:
        reader = csv.reader(fh)
        header = next(reader)
        rows = [r for r in reader if len(r) == len(header)]
    if not rows:
        sys.exit(f"{path} has no data rows")
    data = np.array(rows, dtype=float)
    cols = {name: data[:, i] for i, name in enumerate(header)}
    # The PC clock and the carried-over press count survive a board reset after a
    # USB reconnect; the board's own t_ms and saves restart from zero.
    if "t_host_s" in cols:
        cols["t"] = cols["t_host_s"] - cols["t_host_s"][0]
    else:
        cols["t"] = (cols["t_ms"] - cols["t_ms"][0]) / 1000.0
    return cols


def press_times(d: dict[str, np.ndarray]) -> np.ndarray:
    saves = d["saves_total"] if "saves_total" in d else d["saves"]
    idx = np.nonzero(np.diff(saves) > 0)[0] + 1
    return d["t"][idx]


def hold_mask(d: dict[str, np.ndarray], t_press: float) -> np.ndarray:
    return (d["t"] >= t_press + HOLD_START) & (d["t"] <= t_press + HOLD_END)


def zones(d: dict[str, np.ndarray]) -> np.ndarray:
    z = np.stack([d[f"z{i}"] for i in range(64)], axis=1)
    return np.where(z < 0, np.nan, z)


def plot_tof(path: Path, truth_cm: list[float]) -> None:
    d = load(path)
    presses = press_times(d)
    if len(presses) != len(truth_cm):
        sys.exit(f"{len(presses)} presses in the recording but {len(truth_cm)} true distances given")

    truth = np.array(truth_cm) * 10.0
    centre = np.where(d["tof_centre_mm"] > 0, d["tof_centre_mm"], np.nan)
    z = zones(d)
    means, stds, ns, maps = [], [], [], []
    for tp in presses:
        m = hold_mask(d, tp)
        vals = centre[m]
        vals = vals[~np.isnan(vals)]
        means.append(vals.mean() if len(vals) else np.nan)
        stds.append(vals.std(ddof=1) if len(vals) > 1 else np.nan)
        ns.append(len(vals))
        maps.append(np.nanmedian(z[m], axis=0) if m.any() else np.full(64, np.nan))
    means, stds = np.array(means), np.array(stds)
    err = means - truth

    ok = ~np.isnan(means)
    slope, offset = np.polyfit(truth[ok], means[ok], 1)
    fit = slope * truth + offset
    r2 = 1 - np.sum((means[ok] - fit[ok]) ** 2) / np.sum((means[ok] - means[ok].mean()) ** 2)

    fig, ax = plt.subplots(2, 2, figsize=(13, 8.5))
    fig.suptitle("VL53L5CX distance characterisation - centre zones, flat wall target",
                 fontweight="bold")

    a = ax[0, 0]
    a.plot(d["t"], centre, color=BLUE, lw=1)
    for tp, tr in zip(presses, truth):
        a.axvspan(tp + HOLD_START, tp + HOLD_END, color=GREEN, alpha=0.15, lw=0)
        a.hlines(tr, tp, tp + HOLD_END + 1, colors="k", linestyles="--", lw=0.8)
    a.set(title="Raw trace (green = hold window, dashed = tape measure)",
          xlabel="time (s)", ylabel="centre distance (mm)")

    a = ax[0, 1]
    lim = [0, max(truth.max(), np.nanmax(means)) * 1.05]
    a.plot(lim, lim, "k--", lw=0.8, label="ideal (measured = true)")
    a.errorbar(truth, means, yerr=stds, fmt="o", color=BLUE, capsize=3, label="measured, mean +/- 1 sd")
    a.plot(truth, fit, color=ORANGE, lw=1.2,
           label=f"fit: {slope:.3f} x true {offset:+.0f} mm, R2={r2:.4f}")
    a.set(title="Measured vs true distance", xlabel="true distance (mm)",
          ylabel="measured distance (mm)", xlim=lim, ylim=lim)
    a.legend(fontsize=8)

    a = ax[1, 0]
    a.axhspan(-APP_TOLERANCE_MM, APP_TOLERANCE_MM, color=GREEN, alpha=0.12, lw=0,
              label="app tolerance +/-3 cm")
    a.axhline(0, color="k", lw=0.8)
    a.errorbar(truth, err, yerr=stds, fmt="o", color=ORANGE, capsize=3, label="error +/- 1 sd")
    a.set(title="Error (measured - true)", xlabel="true distance (mm)", ylabel="error (mm)")
    a.legend(fontsize=8)

    a = ax[1, 1]
    a.bar(truth_cm, stds, width=np.diff(np.r_[0, truth_cm]).min() * 0.6, color=PINK)
    a.set(title="Noise: standard deviation within each hold",
          xlabel="true distance (cm)", ylabel="sd of 3 s hold (mm)")

    fig.tight_layout()
    stem = path.stem
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    out1 = FIG_DIR / f"{stem}_characterisation.png"
    fig.savefig(out1)
    plt.close(fig)

    # Depth maps: one 8x8 median map per step. The ULD reports rows bottom-up,
    # so rows are flipped to match the scene as seen from behind the sensor.
    n = len(maps)
    cols = min(n, 4)
    rows = int(np.ceil(n / cols))
    fig, axs = plt.subplots(rows, cols, figsize=(3.2 * cols, 3.0 * rows), squeeze=False)
    fig.suptitle("VL53L5CX 8x8 depth maps at each step (median of the hold window)",
                 fontweight="bold")
    vmax = np.nanmax(np.array(maps))
    for k, (mp, tr) in enumerate(zip(maps, truth_cm)):
        a = axs[k // cols, k % cols]
        grid = mp.reshape(8, 8)[::-1]
        im = a.imshow(grid, cmap="viridis_r", vmin=0, vmax=vmax)
        a.set_title(f"true {tr:g} cm", fontsize=10)
        a.set_xticks([]); a.set_yticks([]); a.grid(False)
        for (r, c), v in np.ndenumerate(grid):
            a.text(c, r, "-" if np.isnan(v) else f"{v / 10:.0f}", ha="center", va="center",
                   fontsize=6, color="white" if not np.isnan(v) and v > vmax * 0.5 else "black")
    for k in range(n, rows * cols):
        axs[k // cols, k % cols].axis("off")
    fig.colorbar(im, ax=axs, shrink=0.8, label="distance (mm); cell labels in cm")
    out2 = FIG_DIR / f"{stem}_depthmaps.png"
    fig.savefig(out2)
    plt.close(fig)

    print(f"{'true cm':>8} {'mean mm':>9} {'error mm':>9} {'sd mm':>7} {'n':>4}")
    for tr, mu, e, s, k in zip(truth_cm, means, err, stds, ns):
        print(f"{tr:8g} {mu:9.1f} {e:+9.1f} {s:7.1f} {k:4d}")
    print(f"fit: measured = {slope:.4f} x true {offset:+.1f} mm, R2 = {r2:.5f}")
    print(f"figures: {out1}\n         {out2}")


BAND_NAMES = ["f1_405", "f2_425", "fz_450", "f3_475", "f4_515", "f5_550",
              "fy_555", "fxl_600", "f6_640", "f7_690", "f8_745", "nir_855"]
BAND_NM = np.array([405, 425, 450, 475, 515, 550, 555, 600, 640, 690, 745, 855])
LIGHT_SETTLE_S = 1.0      # after a press, skip this long before trusting readings
LIGHT_READINGS = 6        # use the last N distinct, valid spectral readings of each step


def light_steps(d: dict[str, np.ndarray], presses: np.ndarray) -> list[np.ndarray]:
    """Row indices of the settled spectral readings for each step.

    The spectrum only changes when as_seq increments (about every 0.5 s) and is
    only trustworthy when as_valid is 1 (not saturated, not mid gain change), so
    each step keeps the last LIGHT_READINGS distinct valid readings before the
    next press - by then the auto-gain has converged."""
    ends = np.r_[presses[1:], d["t"][-1] + 1]
    steps = []
    for tp, te in zip(presses, ends):
        m = (d["t"] >= tp + LIGHT_SETTLE_S) & (d["t"] < te) & (d["as_valid"] == 1)
        idx = np.nonzero(m)[0]
        _, first = np.unique(d["as_seq"][idx], return_index=True)
        steps.append(idx[np.sort(first)][-LIGHT_READINGS:])
    return steps


def plot_light(path: Path, labels: list[str]) -> None:
    d = load(path)
    presses = press_times(d)
    if len(presses) != len(labels):
        sys.exit(f"{len(presses)} presses in the recording but {len(labels)} labels given")
    steps = light_steps(d, presses)
    for lab, idx in zip(labels, steps):
        if len(idx) < 2:
            print(f"warning: only {len(idx)} settled readings for '{lab}'")

    clear = d["clear"]
    spectra = np.stack([d[b] for b in BAND_NAMES], axis=1)
    level = np.array([clear[i].mean() if len(i) else np.nan for i in steps])
    level_sd = np.array([clear[i].std(ddof=1) if len(i) > 1 else np.nan for i in steps])
    spec = np.array([spectra[i].mean(axis=0) if len(i) else np.full(12, np.nan) for i in steps])
    gains = [sorted(set(d["as_gain"][i])) for i in steps]
    # Warm vs cool balance: red (640 nm) over blue (450 nm).
    ratio = spec[:, BAND_NAMES.index("f6_640")] / spec[:, BAND_NAMES.index("fz_450")]

    fig, ax = plt.subplots(2, 2, figsize=(14, 9))
    fig.suptitle("AS7343 response to an LED photo panel - brightness and colour-temperature steps",
                 fontweight="bold")

    a = ax[0, 0]
    ok = d["as_valid"] == 1
    a.plot(d["t"][ok], clear[ok], ".", ms=2, color=BLUE, label="clear channel (valid)")
    a.plot(d["t"][~ok], clear[~ok], ".", ms=2, color="0.75", label="saturated / gain settling")
    for tp, lab, idx in zip(presses, labels, steps):
        a.axvline(tp, color="k", lw=0.5, ls=":")
        if len(idx):
            a.axvspan(d["t"][idx[0]], d["t"][idx[-1]], color=GREEN, alpha=0.15, lw=0)
        a.text(tp, 1.02, lab, transform=a.get_xaxis_transform(), rotation=35, fontsize=7,
               ha="left", va="bottom")
    a.set_yscale("log")
    a.set(xlabel="time (s)", ylabel="clear, counts / gain (log)")
    a.set_title("Raw trace (green = readings used)", pad=38)
    a.legend(fontsize=8, loc="lower right")

    a = ax[0, 1]
    x = np.arange(len(labels))
    a.bar(x, level, yerr=level_sd, color=[PINK if i == 0 else BLUE for i in x], capsize=3)
    a.set_yscale("log")
    a.set_xticks(x, labels, rotation=30, ha="right", fontsize=8)
    a.set(ylabel="clear, counts / gain (log)",
          title="Light level per step (mean +/- 1 sd of settled readings)")
    for i, (lv, sd, g) in enumerate(zip(level, level_sd, gains)):
        if not np.isnan(lv):
            a.text(i, lv * 1.15, f"{100 * sd / lv:.1f}%\ng {','.join(f'{v:g}' for v in g)}",
                   ha="center", fontsize=6)

    a = ax[1, 0]
    colours = plt.cm.viridis(np.linspace(0, 0.9, len(labels)))
    for s, lab, c in zip(spec, labels, colours):
        if np.all(np.isnan(s)) or np.nansum(s) == 0:
            continue
        a.plot(BAND_NM, s / np.nanmax(s), "o-", ms=3, lw=1.2, color=c, label=lab)
    a.set(xlabel="wavelength (nm)", ylabel="relative response (each step's peak = 1)",
          title="Spectral shape per step (brightness removed)")
    a.legend(fontsize=7, ncol=2)

    a = ax[1, 1]
    a.bar(x, ratio, color=ORANGE)
    a.set_xticks(x, labels, rotation=30, ha="right", fontsize=8)
    a.set(ylabel="640 nm / 450 nm", title="Warm/cool balance: red over blue (higher = warmer)")

    fig.tight_layout()
    FIG_DIR.mkdir(parents=True, exist_ok=True)
    out = FIG_DIR / f"{path.stem}_characterisation.png"
    fig.savefig(out)
    plt.close(fig)

    print(f"{'step':<24} {'clear':>10} {'sd %':>6} {'red/blue':>9} {'n':>3}  gain")
    for lab, lv, sd, r, idx, g in zip(labels, level, level_sd, ratio, steps, gains):
        print(f"{lab:<24} {lv:10.2f} {100 * sd / lv if lv else float('nan'):6.2f} "
              f"{r:9.3f} {len(idx):3d}  {','.join(f'{v:g}' for v in g)}")
    print(f"figure: {out}")


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="test", required=True)
    t = sub.add_parser("tof", help="distance steps against a flat wall")
    t.add_argument("csv", type=Path)
    t.add_argument("--truth-cm", required=True, help="comma-separated tape-measure distances, one per press")
    s = sub.add_parser("light", help="light-panel brightness / colour steps")
    s.add_argument("csv", type=Path)
    s.add_argument("--labels", required=True,
                   help="comma-separated setting per press, e.g. off,10%%_5600K,25%%_5600K")
    args = ap.parse_args()
    if args.test == "tof":
        plot_tof(args.csv, [float(x) for x in args.truth_cm.split(",")])
    elif args.test == "light":
        plot_light(args.csv, [x.strip() for x in args.labels.split(",")])


if __name__ == "__main__":
    main()
