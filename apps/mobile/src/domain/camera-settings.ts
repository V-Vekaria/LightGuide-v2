/** Accept familiar shutter fractions without evaluating arbitrary expressions. */
export function parseCameraNumber(
  raw: string,
  label: string,
  max: number,
): number | null {
  if (!raw.trim()) return null;
  if (!/^\d+(?:\.\d+)?$|^\.\d+$/.test(raw.trim()))
    throw new Error(`${label}: enter a positive number.`);
  const value = Number(raw);
  if (!Number.isFinite(value) || value <= 0 || value > max)
    throw new Error(
      `${label}: enter a value above 0 and no greater than ${max}.`,
    );
  return value;
}
export function parseShutter(raw: string): number | null {
  const text = raw.trim();
  if (!text) return null;
  if (!text.includes("/"))
    return parseCameraNumber(text, "Shutter speed", 86400);
  const fraction = /^(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)$/.exec(text);
  if (!fraction)
    throw new Error(
      "Shutter speed: use 1/200 or decimal seconds such as 0.005.",
    );
  const value = Number(fraction[1]) / Number(fraction[2]);
  if (!Number.isFinite(value) || value <= 0 || value > 86400)
    throw new Error(
      "Shutter speed: use a positive fraction with a nonzero denominator.",
    );
  return value;
}
export function formatShutter(seconds: number | null | undefined): string {
  if (seconds == null) return "";
  const reciprocal = 1 / seconds;
  if (seconds < 1 && Math.abs(reciprocal - Math.round(reciprocal)) < 0.000001)
    return `1/${Math.round(reciprocal)}`;
  return String(Number(seconds.toPrecision(8)));
}
