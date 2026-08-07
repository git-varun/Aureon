import { prisma } from "../prisma";

/** Positions/transactions/quotes use TIMESTAMP WITHOUT TIME ZONE columns.
 * Prisma reads the naive value back as a Date whose UTC getters equal the
 * raw column value (verified empirically) — so it must be reinterpreted as
 * wall-clock time in the session's TimeZone GUC and converted to a true UTC
 * instant, mirroring the Python backend's _naive_to_utc. */
export async function getSessionTimeZone(): Promise<string> {
  const rows = await prisma.$queryRaw<{ current_setting: string }[]>`SELECT current_setting('TimeZone')`;
  return rows[0].current_setting;
}

function tzOffsetMinutes(date: Date, timeZone: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts: Record<string, string> = {};
  for (const p of dtf.formatToParts(date)) {
    if (p.type !== "literal") parts[p.type] = p.value;
  }
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return (asUtc - date.getTime()) / 60000;
}

export function naiveToUtc(date: Date, tzName: string): Date {
  const ms = date.getTime();
  // Intl.DateTimeFormat only reports whole seconds — computing the offset
  // from the full-precision timestamp would silently truncate the
  // millisecond fraction. Floor to the second for the offset lookup, then
  // reapply the fraction afterward so precision survives a UTC (zero-offset)
  // round trip exactly.
  const flooredMs = Math.floor(ms / 1000) * 1000;
  const fraction = ms - flooredMs;
  const offsetMinutes = tzOffsetMinutes(new Date(flooredMs), tzName);
  return new Date(flooredMs - offsetMinutes * 60000 + fraction);
}

/** Matches Python's tz-aware datetime.isoformat() suffix ("+00:00" rather
 * than "Z"). Precision is still capped at milliseconds (JS Date has no
 * microsecond field, unlike the Python values this mirrors) — padded to 6
 * digits so the shape matches even though the last 3 digits are always 0. */
export function toPythonIsoString(d: Date): string {
  return d.toISOString().replace("Z", "000+00:00");
}
