import { useState } from "react";
import { CalendarDays, Clock, Infinity as InfinityIcon, Repeat } from "lucide-react";
import { Plus, X } from "lucide-react";
import type { PeriodicEndMode, PeriodicSpec, PeriodicType, TimingMode } from "../lib/types";
import { cn, formatTimingSummary, formatTime12hPublic, parseTimeString, fromDateInputValue, fromDateAndTime, toDateInputValue, toTimeValue } from "../lib/utils";

// ── Types ────────────────────────────────────────────────────────────────────

export interface TimingState {
  timing_mode: TimingMode;
  deadline_at: string | null;
  grace_days: number | null;
  periodic_type: PeriodicType | null;
  periodic_spec: PeriodicSpec | null;
  periodic_end_mode: PeriodicEndMode | null;
  periodic_end_at: string | null;
  periodic_end_count: number | null;
}

interface TimingEditorProps {
  entityKind: "task" | "initiative";
  value: TimingState;
  onChange: (next: TimingState) => void;
}

// ── Constants ────────────────────────────────────────────────────────────────

const TASK_MODES: { value: TimingMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "deadline", label: "Deadline" },
  { value: "flexible", label: "Flexible" },
  { value: "periodic", label: "Periodic" },
];

const INITIATIVE_MODES: { value: TimingMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "indefinite", label: "Indefinite" },
  { value: "deadline", label: "Deadline" },
  { value: "flexible", label: "Flexible" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const GRACE_OPTIONS = [
  { label: "None", value: 0 },
  { label: "1 day", value: 1 },
  { label: "3 days", value: 3 },
  { label: "1 week", value: 7 },
  { label: "Custom...", value: -1 },
];

// ── Spec Helpers ─────────────────────────────────────────────────────────────

function getWeeklyDays(spec: PeriodicSpec | null): number[] {
  if (!spec || !Array.isArray(spec.days)) return [];
  return spec.days as number[];
}

function getMonthlyMode(spec: PeriodicSpec | null): "day_number" | "ordinal" {
  if (!spec) return "day_number";
  return (spec.mode as string) === "ordinal" ? "ordinal" : "day_number";
}

function getMonthlyDays(spec: PeriodicSpec | null): number[] {
  if (!spec || (spec.mode as string) === "ordinal") return [];
  return Array.isArray(spec.days) ? (spec.days as number[]) : [];
}

function getMonthlyOrdinal(spec: PeriodicSpec | null): { ordinal: number; weekday: number } {
  if (!spec || (spec.mode as string) !== "ordinal") return { ordinal: 1, weekday: 0 };
  return { ordinal: (spec.ordinal as number) ?? 1, weekday: (spec.weekday as number) ?? 0 };
}

function getYearlyEntries(spec: PeriodicSpec | null): { month: number; day: number }[] {
  if (!spec || !Array.isArray(spec.entries)) return [{ month: 1, day: 1 }];
  return spec.entries as { month: number; day: number }[];
}

function getIntervalSpec(spec: PeriodicSpec | null): { every_n: number; unit: string } {
  if (!spec) return { every_n: 1, unit: "days" };
  return { every_n: (spec.every_n as number) ?? 1, unit: (spec.unit as string) ?? "days" };
}

function getOccurrenceTime(spec: PeriodicSpec | null): string {
  return (spec?.occurrence_time as string) ?? "23:59";
}

function getTimeOverrides(spec: PeriodicSpec | null): Record<string, string> {
  return (spec?.time_overrides as Record<string, string>) ?? {};
}

function graceToSelectValue(days: number | null): number {
  if (days === null || days === 0) return 0;
  if (days === 1 || days === 3 || days === 7) return days;
  return -1;
}

// ── Summary Icon ─────────────────────────────────────────────────────────────

function SummaryIcon({ mode }: { mode: TimingMode }) {
  const cls = "h-4 w-4 shrink-0 text-zinc-400";
  if (mode === "periodic") return <Repeat className={cls} />;
  if (mode === "indefinite") return <InfinityIcon className={cls} />;
  if (mode === "deadline" || mode === "flexible") return <CalendarDays className={cls} />;
  return <Clock className={cls} />;
}

// ── Time Input (typeable) ────────────────────────────────────────────────────

function TimeInput({
  value,
  onChange,
  disabled,
  className,
}: {
  value: string;            // HH:MM 24h
  onChange: (v: string) => void;
  disabled?: boolean;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  function startEditing() {
    setDraft(formatTime12hPublic(value));
    setEditing(true);
  }

  function commit() {
    setEditing(false);
    const parsed = parseTimeString(draft);
    if (parsed) onChange(parsed);
  }

  if (editing && !disabled) {
    return (
      <input
        type="text"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === "Enter") { e.preventDefault(); commit(); }
          if (e.key === "Escape") setEditing(false);
        }}
        autoFocus
        placeholder="e.g. 9am, 2:30pm"
        className={cn("input w-32 text-sm", className)}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={startEditing}
      disabled={disabled}
      className={cn(
        "input w-32 text-left text-sm",
        disabled && "opacity-50 cursor-not-allowed",
        className,
      )}
    >
      {formatTime12hPublic(value)}
    </button>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────

export function TimingEditor({ entityKind, value, onChange }: TimingEditorProps) {
  const [open, setOpen] = useState(false);
  const [customGrace, setCustomGrace] = useState(() => graceToSelectValue(value.grace_days) === -1);

  const modes = entityKind === "task" ? TASK_MODES : INITIATIVE_MODES;
  const summary = formatTimingSummary(value);
  const isNone = value.timing_mode === "none";

  function update(patch: Partial<TimingState>) {
    onChange({ ...value, ...patch });
  }

  function setMode(mode: TimingMode) {
    const next: TimingState = { ...value, timing_mode: mode };

    if (mode === "flexible" && !next.grace_days) {
      next.grace_days = 1;
    }
    if (mode === "periodic") {
      if (!next.periodic_type) next.periodic_type = "weekly";
      if (!next.periodic_spec) next.periodic_spec = { days: [] };
      if (!next.periodic_end_mode) next.periodic_end_mode = "never";
    }

    onChange(next);
  }

  function setPeriodicType(pt: PeriodicType) {
    let spec: PeriodicSpec;
    if (pt === "weekly") spec = { days: [] };
    else if (pt === "monthly") spec = { mode: "day_number", days: [] };
    else if (pt === "yearly") spec = { entries: [{ month: 1, day: 1 }] };
    else spec = { every_n: 1, unit: "days" };
    update({ periodic_type: pt, periodic_spec: spec });
  }

  function handleGraceSelect(v: number) {
    if (v === -1) {
      setCustomGrace(true);
      if (!value.grace_days || value.grace_days === 0) update({ grace_days: 2 });
    } else if (v === 0) {
      setCustomGrace(false);
      update({ grace_days: null });
    } else {
      setCustomGrace(false);
      update({ grace_days: v });
    }
  }

  // ── Summary Row (always visible) ────────────────────────────────────────

  return (
    <div className="border-t border-zinc-100 px-6 py-4">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="group inline-flex w-full items-center gap-2 text-left"
      >
        <SummaryIcon mode={value.timing_mode} />
        <span
          className={cn(
            "text-sm font-medium",
            isNone ? "text-zinc-400" : "text-zinc-700",
          )}
        >
          {summary}
        </span>
      </button>

      {/* ── Editor (expanded) ─────────────────────────────────────────────── */}
      {open && (
        <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4 space-y-4">
          {/* Mode selector */}
          <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
            {modes.map((m) => (
              <button
                key={m.value}
                type="button"
                onClick={() => setMode(m.value)}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  value.timing_mode === m.value
                    ? "bg-zinc-800 text-white shadow-sm"
                    : "text-zinc-500 hover:text-zinc-700",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>

          {/* Deadline fields */}
          {(value.timing_mode === "deadline" || value.timing_mode === "flexible") && (
            <div className="space-y-3">
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="label">Due date</label>
                  <input
                    type="date"
                    value={toDateInputValue(value.deadline_at)}
                    onChange={(e) => {
                      const time = toTimeValue(value.deadline_at);
                      update({ deadline_at: fromDateAndTime(e.target.value, time) });
                    }}
                    className="input w-auto text-sm"
                  />
                </div>
                <div>
                  <label className="label">Time</label>
                  <TimeInput
                    value={toTimeValue(value.deadline_at)}
                    onChange={(t) => {
                      const date = toDateInputValue(value.deadline_at);
                      if (date) update({ deadline_at: fromDateAndTime(date, t) });
                    }}
                  />
                </div>
                {value.timing_mode === "flexible" && (
                  <div>
                    <label className="label">Grace period</label>
                    <div className="flex items-center gap-2">
                      <select
                        value={customGrace ? -1 : graceToSelectValue(value.grace_days)}
                        onChange={(e) => handleGraceSelect(Number(e.target.value))}
                        className="select w-auto text-sm"
                      >
                        {GRACE_OPTIONS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                      {customGrace && (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="number"
                            min={1}
                            value={value.grace_days ?? ""}
                            onChange={(e) =>
                              update({ grace_days: e.target.value ? Number(e.target.value) : null })
                            }
                            className="input w-20 text-sm"
                          />
                          <span className="text-sm text-zinc-500">days</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Periodic fields */}
          {value.timing_mode === "periodic" && (
            <PeriodicEditor value={value} onChange={onChange} />
          )}
        </div>
      )}
    </div>
  );
}

// ── Periodic Sub-Editor ──────────────────────────────────────────────────────

function PeriodicEditor({
  value,
  onChange,
}: {
  value: TimingState;
  onChange: (next: TimingState) => void;
}) {
  const [customGrace, setCustomGrace] = useState(() => graceToSelectValue(value.grace_days) === -1);
  const [showPerDayTimes, setShowPerDayTimes] = useState(
    () => Object.keys(getTimeOverrides(value.periodic_spec)).length > 0,
  );

  function update(patch: Partial<TimingState>) {
    onChange({ ...value, ...patch });
  }

  function patchSpec(specPatch: Record<string, unknown>) {
    update({ periodic_spec: { ...value.periodic_spec, ...specPatch } });
  }

  function setPeriodicType(pt: PeriodicType) {
    const prevTime = getOccurrenceTime(value.periodic_spec);
    let spec: PeriodicSpec;
    if (pt === "weekly") spec = { days: [] };
    else if (pt === "monthly") spec = { mode: "day_number", days: [] };
    else if (pt === "yearly") spec = { entries: [{ month: 1, day: 1 }] };
    else spec = { every_n: 1, unit: "days" };
    if (prevTime !== "23:59") spec.occurrence_time = prevTime;
    update({ periodic_type: pt, periodic_spec: spec });
    setShowPerDayTimes(false);
  }

  function toggleWeekday(day: number) {
    const current = getWeeklyDays(value.periodic_spec);
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    const overrides = getTimeOverrides(value.periodic_spec);
    const newOverrides = { ...overrides };
    if (!next.includes(day)) delete newOverrides[String(day)];
    patchSpec({ days: next, time_overrides: Object.keys(newOverrides).length > 0 ? newOverrides : undefined });
  }

  function toggleMonthDay(day: number) {
    const current = getMonthlyDays(value.periodic_spec);
    const next = current.includes(day)
      ? current.filter((d) => d !== day)
      : [...current, day].sort((a, b) => a - b);
    patchSpec({ mode: "day_number", days: next });
  }

  function setMonthlyOrdinal(ordinal: number, weekday: number) {
    patchSpec({ mode: "ordinal", ordinal, weekday });
  }

  function updateYearlyEntryFromDate(idx: number, dateStr: string) {
    if (!dateStr) return;
    const d = new Date(dateStr + "T00:00:00");
    const entries = getYearlyEntries(value.periodic_spec);
    const updated = entries.map((e, i) =>
      i === idx ? { month: d.getMonth() + 1, day: d.getDate() } : e,
    );
    patchSpec({ entries: updated });
  }

  function yearlyEntryToDateValue(entry: { month: number; day: number }): string {
    const y = new Date().getFullYear();
    const m = String(entry.month).padStart(2, "0");
    const d = String(entry.day).padStart(2, "0");
    return `${y}-${m}-${d}`;
  }

  function addYearlyEntry() {
    const entries = getYearlyEntries(value.periodic_spec);
    patchSpec({ entries: [...entries, { month: 1, day: 1 }] });
  }

  function removeYearlyEntry(idx: number) {
    const entries = getYearlyEntries(value.periodic_spec);
    if (entries.length <= 1) return;
    patchSpec({ entries: entries.filter((_, i) => i !== idx) });
  }

  function handleGraceSelect(v: number) {
    if (v === -1) {
      setCustomGrace(true);
      if (!value.grace_days || value.grace_days === 0) update({ grace_days: 2 });
    } else if (v === 0) {
      setCustomGrace(false);
      update({ grace_days: null });
    } else {
      setCustomGrace(false);
      update({ grace_days: v });
    }
  }

  function setOccurrenceTime(time: string) {
    patchSpec({ occurrence_time: time || "23:59" });
  }

  function setDayOverride(day: number, time: string) {
    const overrides = { ...getTimeOverrides(value.periodic_spec) };
    if (time) {
      overrides[String(day)] = time;
    } else {
      delete overrides[String(day)];
    }
    patchSpec({ time_overrides: Object.keys(overrides).length > 0 ? overrides : undefined });
  }

  function enablePerDayTimes() {
    setShowPerDayTimes(true);
    const base = getOccurrenceTime(value.periodic_spec);
    const days = getWeeklyDays(value.periodic_spec);
    const overrides: Record<string, string> = {};
    for (const d of days) overrides[String(d)] = base;
    patchSpec({ time_overrides: overrides, occurrence_time: undefined });
  }

  function disablePerDayTimes() {
    setShowPerDayTimes(false);
    patchSpec({ time_overrides: undefined });
  }

  const occurrenceTime = getOccurrenceTime(value.periodic_spec);
  const isDefaultTime = occurrenceTime === "23:59";
  const selectedDays = getWeeklyDays(value.periodic_spec);
  const overrides = getTimeOverrides(value.periodic_spec);

  return (
    <div className="space-y-4">
      {/* Frequency as dropdown */}
      <div>
        <label className="label">Frequency</label>
        <select
          value={value.periodic_type ?? "weekly"}
          onChange={(e) => setPeriodicType(e.target.value as PeriodicType)}
          className="select w-auto text-sm"
        >
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
          <option value="interval">Custom interval</option>
        </select>
      </div>

      {/* Weekly: day chips */}
      {value.periodic_type === "weekly" && (
        <div>
          <label className="label">Days</label>
          <div className="flex gap-1.5">
            {WEEKDAYS.map((day, idx) => (
              <button
                key={day}
                type="button"
                onClick={() => toggleWeekday(idx)}
                className={cn(
                  "h-9 w-11 rounded-lg border text-sm font-medium transition-all",
                  getWeeklyDays(value.periodic_spec).includes(idx)
                    ? "border-indigo-300 bg-indigo-600 text-white"
                    : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                )}
              >
                {day}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Monthly */}
      {value.periodic_type === "monthly" && (
        <div className="space-y-3">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-white p-0.5">
            <button
              type="button"
              onClick={() =>
                patchSpec({ mode: "day_number", days: getMonthlyDays(value.periodic_spec) })
              }
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                getMonthlyMode(value.periodic_spec) === "day_number"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              By date
            </button>
            <button
              type="button"
              onClick={() => patchSpec({ mode: "ordinal", ordinal: 1, weekday: 0 })}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                getMonthlyMode(value.periodic_spec) === "ordinal"
                  ? "bg-zinc-700 text-white shadow-sm"
                  : "text-zinc-600 hover:text-zinc-900",
              )}
            >
              By pattern
            </button>
          </div>

          {getMonthlyMode(value.periodic_spec) === "day_number" ? (
            <div className="grid grid-cols-7 gap-1">
              {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                <button
                  key={day}
                  type="button"
                  onClick={() => toggleMonthDay(day)}
                  className={cn(
                    "h-8 rounded border text-xs font-medium transition-all",
                    getMonthlyDays(value.periodic_spec).includes(day)
                      ? "border-indigo-300 bg-indigo-600 text-white"
                      : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300",
                  )}
                >
                  {day}
                </button>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <select
                value={getMonthlyOrdinal(value.periodic_spec).ordinal}
                onChange={(e) =>
                  setMonthlyOrdinal(Number(e.target.value), getMonthlyOrdinal(value.periodic_spec).weekday)
                }
                className="select w-auto text-sm"
              >
                {[1, 2, 3, 4].map((n) => (
                  <option key={n} value={n}>
                    {["1st", "2nd", "3rd", "4th"][n - 1]}
                  </option>
                ))}
                <option value={-1}>Last</option>
              </select>
              <select
                value={getMonthlyOrdinal(value.periodic_spec).weekday}
                onChange={(e) =>
                  setMonthlyOrdinal(getMonthlyOrdinal(value.periodic_spec).ordinal, Number(e.target.value))
                }
                className="select w-auto text-sm"
              >
                {WEEKDAYS.map((day, idx) => (
                  <option key={day} value={idx}>
                    {day}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      {/* Yearly */}
      {value.periodic_type === "yearly" && (
        <div className="space-y-2">
          <label className="label">Dates</label>
          {getYearlyEntries(value.periodic_spec).map((entry, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <input
                type="date"
                value={yearlyEntryToDateValue(entry)}
                onChange={(e) => updateYearlyEntryFromDate(idx, e.target.value)}
                className="input w-auto text-sm"
              />
              <span className="text-xs text-zinc-400">
                {MONTHS[(entry.month ?? 1) - 1]} {entry.day}
              </span>
              {getYearlyEntries(value.periodic_spec).length > 1 && (
                <button
                  type="button"
                  onClick={() => removeYearlyEntry(idx)}
                  className="rounded p-1 text-zinc-400 hover:text-red-500"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          ))}
          <button type="button" onClick={addYearlyEntry} className="btn-ghost !px-2 !py-1 text-xs">
            <Plus className="h-3.5 w-3.5" />
            Add date
          </button>
        </div>
      )}

      {/* Interval */}
      {value.periodic_type === "interval" && (
        <div className="flex items-center gap-2">
          <span className="text-sm text-zinc-600">Every</span>
          <input
            type="number"
            min={1}
            value={getIntervalSpec(value.periodic_spec).every_n}
            onChange={(e) =>
              patchSpec({
                every_n: Number(e.target.value) || 1,
                unit: getIntervalSpec(value.periodic_spec).unit,
              })
            }
            className="input w-20 text-sm"
          />
          <select
            value={getIntervalSpec(value.periodic_spec).unit}
            onChange={(e) =>
              patchSpec({
                every_n: getIntervalSpec(value.periodic_spec).every_n,
                unit: e.target.value,
              })
            }
            className="select w-auto text-sm"
          >
            <option value="days">days</option>
            <option value="weeks">weeks</option>
          </select>
        </div>
      )}

      {/* Occurrence time (Tier 2) */}
      <div className="border-t border-zinc-200 pt-4">
        <div className="flex items-center gap-3">
          <div>
            <label className="label">Time for each occurrence</label>
            <div className="flex items-center gap-2">
              <TimeInput
                value={occurrenceTime}
                onChange={setOccurrenceTime}
                disabled={showPerDayTimes}
              />
              {isDefaultTime && !showPerDayTimes && (
                <span className="text-xs text-zinc-400">default end-of-day</span>
              )}
            </div>
          </div>
          {value.periodic_type === "weekly" && selectedDays.length > 0 && (
            <div className="self-end pb-1">
              {!showPerDayTimes ? (
                <button
                  type="button"
                  onClick={enablePerDayTimes}
                  className="text-xs text-indigo-600 hover:text-indigo-700"
                >
                  Different times per day
                </button>
              ) : (
                <button
                  type="button"
                  onClick={disablePerDayTimes}
                  className="text-xs text-zinc-500 hover:text-zinc-700"
                >
                  Same time for all
                </button>
              )}
            </div>
          )}
        </div>

        {/* Per-day time overrides (Tier 3, weekly only) */}
        {showPerDayTimes && value.periodic_type === "weekly" && selectedDays.length > 0 && (
          <div className="mt-3 space-y-1.5 rounded-md border border-zinc-200 bg-white p-3">
            {selectedDays.map((day) => (
              <div key={day} className="flex items-center gap-3">
                <span className="w-10 text-sm font-medium text-zinc-600">{WEEKDAYS[day]}</span>
                <TimeInput
                  value={overrides[String(day)] ?? occurrenceTime}
                  onChange={(t) => setDayOverride(day, t)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Bottom row: ends + grace + starting from */}
      <div className="flex flex-wrap items-end gap-4 border-t border-zinc-200 pt-4">
        <div>
          <label className="label">Ends</label>
          <div className="flex items-center gap-2">
            <select
              value={value.periodic_end_mode ?? "never"}
              onChange={(e) =>
                update({ periodic_end_mode: e.target.value as PeriodicEndMode })
              }
              className="select w-auto text-sm"
            >
              <option value="never">Never</option>
              <option value="until_date">Until date</option>
              <option value="after_count">After count</option>
            </select>
            {value.periodic_end_mode === "until_date" && (
              <input
                type="date"
                value={toDateInputValue(value.periodic_end_at)}
                onChange={(e) => update({ periodic_end_at: fromDateInputValue(e.target.value) })}
                className="input w-auto text-sm"
              />
            )}
            {value.periodic_end_mode === "after_count" && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={value.periodic_end_count ?? ""}
                  onChange={(e) =>
                    update({ periodic_end_count: e.target.value ? Number(e.target.value) : null })
                  }
                  className="input w-20 text-sm"
                />
                <span className="text-sm text-zinc-500">times</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="label">Grace</label>
          <div className="flex items-center gap-2">
            <select
              value={customGrace ? -1 : graceToSelectValue(value.grace_days)}
              onChange={(e) => handleGraceSelect(Number(e.target.value))}
              className="select w-auto text-sm"
            >
              {GRACE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            {customGrace && (
              <div className="flex items-center gap-1.5">
                <input
                  type="number"
                  min={1}
                  value={value.grace_days ?? ""}
                  onChange={(e) =>
                    update({ grace_days: e.target.value ? Number(e.target.value) : null })
                  }
                  className="input w-20 text-sm"
                />
                <span className="text-sm text-zinc-500">days</span>
              </div>
            )}
          </div>
        </div>

        <div>
          <label className="label">Starting from</label>
          <input
            type="date"
            value={toDateInputValue(value.deadline_at)}
            onChange={(e) => update({ deadline_at: fromDateInputValue(e.target.value) })}
            className="input w-auto text-sm"
          />
        </div>
      </div>
    </div>
  );
}
