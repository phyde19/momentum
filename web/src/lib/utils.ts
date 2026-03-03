import { clsx, type ClassValue } from "clsx";
import type { PeriodicSpec, PeriodicType, TimingMode } from "./types";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

const WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const ORDINAL_NAMES: Record<number, string> = { 1: "1st", 2: "2nd", 3: "3rd", 4: "4th", [-1]: "Last" };

function ordinalDay(n: number): string {
  const s = ["th", "st", "nd", "rd"] as const;
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? "th");
}

function formatDeadlineDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function formatTime12h(time24: string): string {
  const parts = time24.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  if (h === 23 && m === 59) return "11:59 PM";
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

function formatOccurrenceTime(spec: PeriodicSpec | null): string {
  const time = spec?.occurrence_time as string | undefined;
  if (!time || time === "23:59") return "";
  return `at ${formatTime12h(time)}`;
}

function formatPeriodicSummary(periodicType: PeriodicType | null, spec: PeriodicSpec | null): string {
  if (!periodicType) return "Recurring";
  const timeSuffix = formatOccurrenceTime(spec);

  if (periodicType === "weekly") {
    const days = Array.isArray(spec?.days) ? (spec.days as number[]) : [];
    const overrides = (spec?.time_overrides ?? {}) as Record<string, string>;
    const hasOverrides = Object.keys(overrides).length > 0;

    let base: string;
    if (days.length === 0) base = "Weekly";
    else if (days.length === 7) base = "Every day";
    else if (days.length === 5 && [0, 1, 2, 3, 4].every((d) => days.includes(d))) base = "Weekdays";
    else base = "Every " + days.map((d) => WEEKDAY_NAMES[d] ?? "").filter(Boolean).join(", ");

    if (hasOverrides && days.length > 0) {
      const parts = days.map((d) => {
        const dayName = WEEKDAY_NAMES[d] ?? "";
        const t = overrides[String(d)];
        return t ? `${dayName} ${formatTime12h(t)}` : dayName;
      });
      return "Every " + parts.join(", ");
    }
    return timeSuffix ? `${base} ${timeSuffix}` : base;
  }

  if (periodicType === "monthly") {
    const mode = spec?.mode as string | undefined;
    let base: string;
    if (mode === "ordinal") {
      const ord = ORDINAL_NAMES[(spec?.ordinal as number) ?? 1] ?? "1st";
      const wd = WEEKDAY_NAMES[(spec?.weekday as number) ?? 0] ?? "Mon";
      base = `Monthly, ${ord} ${wd}`;
    } else {
      const days = Array.isArray(spec?.days) ? (spec.days as number[]) : [];
      base = days.length === 0 ? "Monthly" : "Monthly on " + days.map(ordinalDay).join(", ");
    }
    return timeSuffix ? `${base} ${timeSuffix}` : base;
  }

  if (periodicType === "yearly") {
    const entries = Array.isArray(spec?.entries) ? (spec.entries as { month: number; day: number }[]) : [];
    const base = entries.length === 0
      ? "Yearly"
      : "Yearly on " + entries.map((e) => `${MONTH_NAMES[(e.month ?? 1) - 1]} ${e.day ?? 1}`).join(", ");
    return timeSuffix ? `${base} ${timeSuffix}` : base;
  }

  if (periodicType === "interval") {
    const n = (spec?.every_n as number) ?? 1;
    const unit = (spec?.unit as string) ?? "days";
    const base = n === 1
      ? (unit === "weeks" ? "Every week" : "Every day")
      : `Every ${n} ${unit}`;
    return timeSuffix ? `${base} ${timeSuffix}` : base;
  }

  return "Recurring";
}

export interface TimingSummaryInput {
  timing_mode: TimingMode;
  deadline_at?: string | null;
  grace_days?: number | null;
  periodic_type?: PeriodicType | null;
  periodic_spec?: PeriodicSpec | null;
  periodic_end_mode?: string | null;
  periodic_end_at?: string | null;
  periodic_end_count?: number | null;
}

function formatGraceLabel(days: number | null | undefined): string {
  if (!days) return "";
  if (days === 1) return "+1d grace";
  if (days === 7) return "+1w grace";
  return `+${days}d grace`;
}

export function formatTimingSummary(t: TimingSummaryInput): string {
  if (t.timing_mode === "none") return "No schedule";
  if (t.timing_mode === "indefinite") return "Open-ended";

  if (t.timing_mode === "deadline") {
    const d = formatDeadlineDate(t.deadline_at);
    return d ? `Due ${d}` : "Deadline (no date set)";
  }

  if (t.timing_mode === "flexible") {
    const d = formatDeadlineDate(t.deadline_at);
    const g = t.grace_days;
    if (!d) return "Flexible (no date set)";
    const graceLabel = formatGraceLabel(g);
    return graceLabel ? `Target ${d} (${graceLabel})` : `Target ${d}`;
  }

  if (t.timing_mode === "periodic") {
    const parts: string[] = [formatPeriodicSummary(t.periodic_type ?? null, t.periodic_spec ?? null)];

    if (t.periodic_end_mode === "until_date" && t.periodic_end_at) {
      parts.push(`until ${formatDeadlineDate(t.periodic_end_at)}`);
    } else if (t.periodic_end_mode === "after_count" && t.periodic_end_count) {
      parts.push(`× ${t.periodic_end_count}`);
    }

    const graceLabel = formatGraceLabel(t.grace_days);
    if (graceLabel) parts.push(graceLabel);

    if (t.deadline_at) {
      parts.push(`from ${formatDeadlineDate(t.deadline_at)}`);
    }

    return parts.join(" · ");
  }

  return "Scheduled";
}

export type TimingUrgency = "overdue" | "soon" | "normal" | "none";

export function getTimingUrgency(t: TimingSummaryInput): TimingUrgency {
  if (t.timing_mode === "none" || t.timing_mode === "indefinite" || t.timing_mode === "periodic") {
    return "none";
  }
  if (!t.deadline_at) return "none";

  const now = new Date();
  const deadline = new Date(t.deadline_at);
  const diffMs = deadline.getTime() - now.getTime();
  const diffDays = diffMs / 86_400_000;

  if (t.timing_mode === "flexible" && t.grace_days) {
    if (diffDays < -t.grace_days) return "overdue";
    if (diffDays < 0) return "soon";
    if (diffDays < 3) return "soon";
    return "normal";
  }

  if (diffDays < 0) return "overdue";
  if (diffDays < 3) return "soon";
  return "normal";
}

/** Format an ISO date string as a short human-readable label */
export function formatDate(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60_000);
  const diffHours = Math.floor(diffMs / 3_600_000);
  const diffDays = Math.floor(diffMs / 86_400_000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;

  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

/** Format a date for the date input (YYYY-MM-DD) */
export function toDateInputValue(iso: string | null | undefined): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

/** Format a date input value to ISO string (end-of-day by default) */
export function fromDateInputValue(value: string): string | null {
  if (!value) return null;
  return new Date(value + "T23:59:00Z").toISOString();
}

/** Extract the time portion (HH:MM) from an ISO string, defaulting to 23:59 */
export function toTimeValue(iso: string | null | undefined): string {
  if (!iso) return "23:59";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Compose a date (YYYY-MM-DD) and time (HH:MM) into an ISO string. Time defaults to 23:59. */
export function fromDateAndTime(dateValue: string, timeValue?: string): string | null {
  if (!dateValue) return null;
  const time = timeValue || "23:59";
  return new Date(`${dateValue}T${time}:00`).toISOString();
}

/** Parse a human-typed time string into HH:MM (24h). Returns null if unparseable. */
export function parseTimeString(raw: string): string | null {
  const s = raw.trim().toLowerCase().replace(/\s+/g, "");
  if (!s) return null;

  const amPm = s.match(/(am|pm)$/);
  const digits = s.replace(/(am|pm)$/, "");

  let h: number;
  let m: number;

  if (digits.includes(":")) {
    const [hStr, mStr] = digits.split(":");
    h = parseInt(hStr ?? "", 10);
    m = parseInt(mStr ?? "", 10);
  } else if (digits.length <= 2) {
    h = parseInt(digits, 10);
    m = 0;
  } else if (digits.length === 3) {
    h = parseInt(digits[0]!, 10);
    m = parseInt(digits.slice(1), 10);
  } else if (digits.length === 4) {
    h = parseInt(digits.slice(0, 2), 10);
    m = parseInt(digits.slice(2), 10);
  } else {
    return null;
  }

  if (isNaN(h) || isNaN(m) || m < 0 || m > 59) return null;

  if (amPm) {
    if (h < 1 || h > 12) return null;
    if (amPm[1] === "pm" && h !== 12) h += 12;
    if (amPm[1] === "am" && h === 12) h = 0;
  } else {
    if (h < 0 || h > 23) return null;
  }

  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Format HH:MM (24h) as human-readable 12h string */
export function formatTime12hPublic(time24: string): string {
  const parts = time24.split(":").map(Number);
  const h = parts[0] ?? 0;
  const m = parts[1] ?? 0;
  const suffix = h >= 12 ? "PM" : "AM";
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${String(m).padStart(2, "0")} ${suffix}`;
}

// ── Occurrence generation ───────────────────────────────────────────────────

function jsWeekdayToOurs(jsDay: number): number {
  return (jsDay + 6) % 7; // JS: 0=Sun..6=Sat → Ours: 0=Mon..6=Sun
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export interface OccurrenceGeneratorInput {
  periodic_type: PeriodicType;
  periodic_spec: PeriodicSpec | null;
  deadline_at?: string | null;
  periodic_end_mode?: string | null;
  periodic_end_at?: string | null;
  periodic_end_count?: number | null;
}

export function generateOccurrences(
  input: OccurrenceGeneratorInput,
  maxCount = 12,
): string[] {
  const { periodic_type, periodic_spec } = input;
  if (!periodic_spec) return [];

  const startFrom = input.deadline_at ? new Date(input.deadline_at) : new Date();
  startFrom.setHours(0, 0, 0, 0);

  const endDate = input.periodic_end_mode === "until_date" && input.periodic_end_at
    ? new Date(input.periodic_end_at)
    : addDays(new Date(), 365);
  endDate.setHours(23, 59, 59, 999);

  const endCount = input.periodic_end_mode === "after_count" && input.periodic_end_count
    ? input.periodic_end_count
    : maxCount;

  const limit = Math.min(maxCount, endCount);
  const results: string[] = [];

  if (periodic_type === "weekly") {
    const days = Array.isArray(periodic_spec.days) ? (periodic_spec.days as number[]) : [];
    if (days.length === 0) return [];
    const cursor = new Date(startFrom);
    for (let i = 0; i < 400 && results.length < limit; i++) {
      if (cursor > endDate) break;
      if (days.includes(jsWeekdayToOurs(cursor.getDay()))) {
        results.push(toYMD(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  } else if (periodic_type === "monthly") {
    const mode = periodic_spec.mode as string | undefined;
    if (mode === "ordinal") {
      const ordinal = (periodic_spec.ordinal as number) ?? 1;
      const weekday = (periodic_spec.weekday as number) ?? 0;
      const cursor = new Date(startFrom.getFullYear(), startFrom.getMonth(), 1);
      for (let i = 0; i < 24 && results.length < limit; i++) {
        const yr = cursor.getFullYear();
        const mo = cursor.getMonth();
        const jsWd = (weekday + 1) % 7; // ours→JS
        let first = new Date(yr, mo, 1);
        while (first.getDay() !== jsWd) first = addDays(first, 1);
        let target: Date;
        if (ordinal === -1) {
          let last = first;
          while (addDays(last, 7).getMonth() === mo) last = addDays(last, 7);
          target = last;
        } else {
          target = addDays(first, (ordinal - 1) * 7);
        }
        if (target.getMonth() === mo && target >= startFrom && target <= endDate) {
          results.push(toYMD(target));
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    } else {
      const days = Array.isArray(periodic_spec.days) ? (periodic_spec.days as number[]) : [];
      if (days.length === 0) return [];
      const cursor = new Date(startFrom.getFullYear(), startFrom.getMonth(), 1);
      for (let i = 0; i < 24 && results.length < limit; i++) {
        for (const day of days) {
          const d = new Date(cursor.getFullYear(), cursor.getMonth(), day);
          if (d.getMonth() === cursor.getMonth() && d >= startFrom && d <= endDate && results.length < limit) {
            results.push(toYMD(d));
          }
        }
        cursor.setMonth(cursor.getMonth() + 1);
      }
    }
  } else if (periodic_type === "yearly") {
    const entries = Array.isArray(periodic_spec.entries)
      ? (periodic_spec.entries as { month: number; day: number }[])
      : [];
    if (entries.length === 0) return [];
    let year = startFrom.getFullYear();
    for (let i = 0; i < 20 && results.length < limit; i++) {
      for (const entry of entries) {
        const d = new Date(year, (entry.month ?? 1) - 1, entry.day ?? 1);
        if (d >= startFrom && d <= endDate && results.length < limit) {
          results.push(toYMD(d));
        }
      }
      year++;
    }
  } else if (periodic_type === "interval") {
    const everyN = (periodic_spec.every_n as number) ?? 1;
    const unit = (periodic_spec.unit as string) ?? "days";
    const step = unit === "weeks" ? everyN * 7 : everyN;
    const cursor = new Date(startFrom);
    for (let i = 0; i < 400 && results.length < limit; i++) {
      if (cursor > endDate) break;
      results.push(toYMD(cursor));
      cursor.setDate(cursor.getDate() + step);
    }
  }

  return results;
}

/** Capitalize first letter and replace underscores with spaces */
export function humanize(s: string): string {
  return s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());
}
