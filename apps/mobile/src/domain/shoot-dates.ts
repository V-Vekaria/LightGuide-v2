// Calendar planning uses the owner's London day, not the build server's clock.
export function todayKey(now = new Date()): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/London",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  return ["year", "month", "day"]
    .map((k) => parts.find((p) => p.type === k)!.value)
    .join("-");
}
export function dateKey(value: string | null | undefined): string {
  if (!value) return "";
  if (/^\d{4}-\d{2}-\d{2}T/.test(value)) return todayKey(new Date(value));
  const uk = /^(\d{2})[-/](\d{2})[-/](\d{4})$/.exec(value);
  return uk ? `${uk[3]}-${uk[2]}-${uk[1]}` : value;
}
export function dateError(
  value: string,
  today = todayKey(),
  original?: string | null,
): string | null {
  if (!value) return null;
  const key = dateKey(value);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key))
    return "Enter a date as DD-MM-YYYY, or choose from the calendar.";
  const parsed = new Date(key + "T12:00:00Z");
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== key
  )
    return "Choose a valid calendar date.";
  if (key < today && key !== dateKey(original))
    return "Choose today or a future date. Past dates cannot be used for a new shoot plan.";
  return null;
}
export function shootState(
  shoot: { status: string; scheduled_at?: string | null },
  today = todayKey(),
): "Planned" | "Completed" | "Date passed" {
  if (shoot.status === "completed") return "Completed";
  return shoot.scheduled_at && dateKey(shoot.scheduled_at) < today
    ? "Date passed"
    : "Planned";
}
export function scheduledAt(value: string): string | null {
  const key = dateKey(value); // Noon UTC preserves the London calendar day in summer and winter.
  return key ? key + "T12:00:00.000Z" : null;
}
