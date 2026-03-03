import { useState, useMemo } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router";
import {
  ArrowLeft,
  ChevronRight,
  Save,
  Archive,
  Link2,
  Plus,
  X,
} from "lucide-react";
import {
  useArchiveTask,
  useAddTaskReason,
  useCreateTask,
  useDrivers,
  useInitiatives,
  useLinkTaskDrivers,
  useTask,
  useTaskReasons,
  useDeleteTaskReason,
  useUnlinkTaskDriver,
  useUpdateTask,
  useUpdateTaskReason,
} from "../lib/hooks";
import type {
  ChecklistItem,
  PeriodicEndMode,
  PeriodicSpec,
  PeriodicType,
  TaskPriority,
  TaskStatus,
  TimingMode,
} from "../lib/types";
import { DriverTypeBadge } from "../components/badges";
import { ReasonSection } from "../components/reason-section";
import { LoadingSpinner } from "../components/loading";
import { showToast } from "../components/toast";
import { formatDate, toDateInputValue, fromDateInputValue, cn } from "../lib/utils";

const STATUS_OPTIONS: { value: TaskStatus; label: string }[] = [
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS: { value: TaskPriority; label: string }[] = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

const TASK_TIMING_MODES: { value: TimingMode; label: string }[] = [
  { value: "none", label: "None" },
  { value: "deadline", label: "Deadline" },
  { value: "flexible", label: "Flexible" },
  { value: "periodic", label: "Periodic" },
];

const PERIODIC_TYPES: { value: PeriodicType; label: string }[] = [
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "yearly", label: "Yearly" },
  { value: "interval", label: "Interval" },
];

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const GRACE_PRESETS = [
  { label: "1 day", value: 1 },
  { label: "3 days", value: 3 },
  { label: "1 week", value: 7 },
];

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

// ── Helpers for periodic spec ────────────────────────────────────────────────

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

// ── Page shell ───────────────────────────────────────────────────────────────

export function TaskDetailPage() {
  const { taskId } = useParams<{ taskId: string }>();
  const isNew = !taskId;
  const { data: task, isLoading } = useTask(taskId);

  if (!isNew && isLoading) {
    return (
      <div className="animate-fade-in">
        <Link to="/tasks" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Tasks
        </Link>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isNew && !task) {
    return (
      <div className="animate-fade-in">
        <Link to="/tasks" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Tasks
        </Link>
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-zinc-500">Task not found</p>
        </div>
      </div>
    );
  }

  return <TaskDetailForm key={taskId ?? "new"} taskId={taskId} isNew={isNew} />;
}

// ── Form component ───────────────────────────────────────────────────────────

function TaskDetailForm({ taskId, isNew }: { taskId?: string; isNew: boolean }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const { data: task } = useTask(taskId);
  const { data: initiatives } = useInitiatives();
  const { data: drivers } = useDrivers();
  const { data: reasons = [], isLoading: reasonsLoading } = useTaskReasons(taskId);

  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const archiveMutation = useArchiveTask();
  const linkDriversMutation = useLinkTaskDrivers();
  const unlinkDriverMutation = useUnlinkTaskDriver();
  const addReasonMutation = useAddTaskReason();
  const updateReasonMutation = useUpdateTaskReason();
  const deleteReasonMutation = useDeleteTaskReason();

  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [initiativeId, setInitiativeId] = useState(
    task?.initiative_id ?? (isNew ? (searchParams.get("initiativeId") ?? "") : ""),
  );

  // Timing state
  const [timingMode, setTimingMode] = useState<TimingMode>(task?.timing_mode ?? "none");
  const [deadlineAt, setDeadlineAt] = useState(toDateInputValue(task?.deadline_at));
  const [graceDays, setGraceDays] = useState<number | "">(task?.grace_days ?? "");
  const [customGrace, setCustomGrace] = useState(
    task?.grace_days ? !GRACE_PRESETS.some((p) => p.value === task.grace_days) : false,
  );
  const [periodicType, setPeriodicType] = useState<PeriodicType>(task?.periodic_type ?? "weekly");
  const [periodicSpec, setPeriodicSpec] = useState<PeriodicSpec | null>(task?.periodic_spec ?? null);
  const [periodicEndMode, setPeriodicEndMode] = useState<PeriodicEndMode>(task?.periodic_end_mode ?? "never");
  const [periodicEndAt, setPeriodicEndAt] = useState(toDateInputValue(task?.periodic_end_at));
  const [periodicEndCount, setPeriodicEndCount] = useState<number | "">(task?.periodic_end_count ?? "");

  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist_json ?? []);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>(task?.driver_ids ?? []);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [timingOpen, setTimingOpen] = useState(false);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  function buildTimingPayload() {
    if (timingMode === "none") {
      return {
        timing_mode: "none" as TimingMode,
        deadline_at: null,
        grace_days: null,
        periodic_type: null,
        periodic_spec: null,
        periodic_end_mode: null,
        periodic_end_at: null,
        periodic_end_count: null,
      };
    }
    if (timingMode === "deadline") {
      return {
        timing_mode: "deadline" as TimingMode,
        deadline_at: fromDateInputValue(deadlineAt),
        grace_days: null,
        periodic_type: null,
        periodic_spec: null,
        periodic_end_mode: null,
        periodic_end_at: null,
        periodic_end_count: null,
      };
    }
    if (timingMode === "flexible") {
      return {
        timing_mode: "flexible" as TimingMode,
        deadline_at: fromDateInputValue(deadlineAt),
        grace_days: typeof graceDays === "number" ? graceDays : 1,
        periodic_type: null,
        periodic_spec: null,
        periodic_end_mode: null,
        periodic_end_at: null,
        periodic_end_count: null,
      };
    }
    return {
      timing_mode: "periodic" as TimingMode,
      deadline_at: fromDateInputValue(deadlineAt),
      grace_days: typeof graceDays === "number" && graceDays > 0 ? graceDays : null,
      periodic_type: periodicType,
      periodic_spec: periodicSpec,
      periodic_end_mode: periodicEndMode,
      periodic_end_at: periodicEndMode === "until_date" ? fromDateInputValue(periodicEndAt) : null,
      periodic_end_count: periodicEndMode === "after_count" && typeof periodicEndCount === "number" ? periodicEndCount : null,
    };
  }

  async function handleSave() {
    if (!title.trim()) return;

    const timing = buildTimingPayload();

    try {
      if (isNew) {
        const created = await createMutation.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          priority,
          initiative_id: initiativeId || null,
          ...timing,
          checklist_json: checklist,
          driver_ids: selectedDriverIds.length > 0 ? selectedDriverIds : undefined,
        });
        showToast("success", "Task created");
        navigate(`/tasks/${created.id}`, { replace: true });
      } else if (taskId) {
        await updateMutation.mutateAsync({
          id: taskId,
          data: {
            title: title.trim(),
            description: description.trim() || null,
            status,
            priority,
            initiative_id: initiativeId || null,
            ...timing,
            checklist_json: checklist,
          },
        });
        setDirty(false);
        showToast("success", "Changes saved");
      }
    } catch (err) {
      showToast("error", (err as Error).message || "Failed to save");
    }
  }

  function handleArchive() {
    if (!taskId) return;
    if (confirm("Archive this task?")) {
      archiveMutation.mutate(taskId, {
        onSuccess: () => {
          showToast("success", "Task archived");
          navigate("/tasks");
        },
        onError: (err) => showToast("error", err.message),
      });
    }
  }

  function handleLinkDriver(driverId: string) {
    if (!taskId) {
      setSelectedDriverIds((prev) => [...prev, driverId]);
      markDirty();
    } else {
      linkDriversMutation.mutate(
        { taskId, data: { driver_ids: [driverId] } },
        { onError: (err) => showToast("error", err.message) },
      );
    }
    setShowDriverPicker(false);
  }

  function handleUnlinkDriver(driverId: string) {
    if (!taskId) {
      setSelectedDriverIds((prev) => prev.filter((id) => id !== driverId));
      markDirty();
    } else {
      unlinkDriverMutation.mutate(
        { taskId, driverId },
        { onError: (err) => showToast("error", err.message) },
      );
    }
  }

  function addChecklistItem() {
    const t = newChecklistItem.trim();
    if (!t) return;
    setChecklist((prev) => [...prev, { title: t, is_done: false }]);
    setNewChecklistItem("");
    markDirty();
  }

  function toggleChecklistItem(index: number) {
    setChecklist((prev) =>
      prev.map((item, i) => (i === index ? { ...item, is_done: !item.is_done } : item)),
    );
    markDirty();
  }

  function removeChecklistItem(index: number) {
    setChecklist((prev) => prev.filter((_, i) => i !== index));
    markDirty();
  }

  // Weekly spec helpers
  function toggleWeekday(day: number) {
    const current = getWeeklyDays(periodicSpec);
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    setPeriodicSpec({ days: next });
    markDirty();
  }

  // Monthly spec helpers
  function toggleMonthDay(day: number) {
    const current = getMonthlyDays(periodicSpec);
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort((a, b) => a - b);
    setPeriodicSpec({ mode: "day_number", days: next });
    markDirty();
  }

  function setMonthlyOrdinalSpec(ordinal: number, weekday: number) {
    setPeriodicSpec({ mode: "ordinal", ordinal, weekday });
    markDirty();
  }

  // Yearly spec helpers
  function updateYearlyEntry(idx: number, field: "month" | "day", value: number) {
    const entries = getYearlyEntries(periodicSpec);
    const updated = entries.map((e, i) => (i === idx ? { ...e, [field]: value } : e));
    setPeriodicSpec({ entries: updated });
    markDirty();
  }

  function addYearlyEntry() {
    const entries = getYearlyEntries(periodicSpec);
    setPeriodicSpec({ entries: [...entries, { month: 1, day: 1 }] });
    markDirty();
  }

  function removeYearlyEntry(idx: number) {
    const entries = getYearlyEntries(periodicSpec);
    if (entries.length <= 1) return;
    setPeriodicSpec({ entries: entries.filter((_, i) => i !== idx) });
    markDirty();
  }

  // Interval spec helpers
  function setIntervalSpec(every_n: number, unit: string) {
    setPeriodicSpec({ every_n, unit });
    markDirty();
  }

  const linkedDriverIds = useMemo(
    () => new Set(isNew ? selectedDriverIds : (task?.driver_ids ?? selectedDriverIds)),
    [isNew, selectedDriverIds, task?.driver_ids],
  );
  const availableDrivers = drivers?.filter(
    (driver) => !linkedDriverIds.has(driver.id) && !driver.deleted_at && driver.state !== "archived",
  );
  const linkedDrivers = drivers?.filter((driver) => linkedDriverIds.has(driver.id));

  return (
    <div className="animate-fade-in">
      <Link to="/tasks" className="btn-ghost mb-4 !px-0 text-zinc-500">
        <ArrowLeft className="h-4 w-4" />
        Back to Tasks
      </Link>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {/* Title */}
        <div className="px-6 pt-6">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
            placeholder="Task title"
            className="w-full border-none bg-transparent text-xl font-semibold text-zinc-900 outline-none placeholder:text-zinc-300"
            autoFocus={isNew}
          />
        </div>

        {/* Status / Priority / Initiative */}
        <div className="flex flex-wrap gap-4 px-6 py-4">
          <div>
            <label className="label">Status</label>
            <select
              value={status}
              onChange={(e) => { setStatus(e.target.value as TaskStatus); markDirty(); }}
              className="select w-auto text-sm"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select
              value={priority}
              onChange={(e) => { setPriority(e.target.value as TaskPriority); markDirty(); }}
              className="select w-auto text-sm"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Initiative</label>
            <select
              value={initiativeId}
              onChange={(e) => { setInitiativeId(e.target.value); markDirty(); }}
              className="select w-auto min-w-[220px] text-sm"
            >
              <option value="">None</option>
              {initiatives
                ?.filter((init) => !init.deleted_at && init.state !== "archived")
                .map((init) => (
                  <option key={init.id} value={init.id}>{init.title}</option>
                ))}
            </select>
          </div>
        </div>

        {/* Description */}
        <div className="border-t border-zinc-100 px-6 py-4">
          <label className="label">Description</label>
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); markDirty(); }}
            placeholder="Add a description..."
            rows={5}
            className="input resize-none text-sm"
          />
        </div>

        {/* Timing */}
        <div className="border-t border-zinc-100 px-6 py-4">
          <button
            type="button"
            onClick={() => setTimingOpen(!timingOpen)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-700"
          >
            <ChevronRight className={cn("h-3.5 w-3.5 transition-transform duration-150", timingOpen && "rotate-90")} />
            Timing
          </button>

          {timingOpen && (
          <div className="mt-3">
          {/* Mode selector */}
          <div className="mb-4 inline-flex rounded-lg border border-zinc-200 p-0.5">
            {TASK_TIMING_MODES.map((mode) => (
              <button
                key={mode.value}
                type="button"
                onClick={() => {
                  setTimingMode(mode.value);
                  if (mode.value === "periodic" && !periodicSpec) {
                    setPeriodicSpec({ days: [] });
                  }
                  markDirty();
                }}
                className={cn(
                  "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                  timingMode === mode.value
                    ? "bg-indigo-600 text-white shadow-sm"
                    : "text-zinc-600 hover:text-zinc-900",
                )}
              >
                {mode.label}
              </button>
            ))}
          </div>

          {/* Deadline / Flexible fields */}
          {(timingMode === "deadline" || timingMode === "flexible") && (
            <div className="space-y-3">
              <div>
                <label className="label">Due date</label>
                <input
                  type="date"
                  value={deadlineAt}
                  onChange={(e) => { setDeadlineAt(e.target.value); markDirty(); }}
                  className="input w-auto text-sm"
                />
              </div>
              {timingMode === "flexible" && (
                <div>
                  <label className="label">Grace period</label>
                  <div className="flex flex-wrap items-center gap-2">
                    {GRACE_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => { setGraceDays(preset.value); setCustomGrace(false); markDirty(); }}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm transition-all",
                          !customGrace && graceDays === preset.value
                            ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                            : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                        )}
                      >
                        {preset.label}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => { setCustomGrace(true); if (typeof graceDays !== "number") setGraceDays(2); markDirty(); }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-all",
                        customGrace
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                      )}
                    >
                      Custom
                    </button>
                    {customGrace && (
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min={1}
                          value={graceDays}
                          onChange={(e) => { setGraceDays(e.target.value ? Number(e.target.value) : ""); markDirty(); }}
                          className="input w-20 text-sm"
                        />
                        <span className="text-sm text-zinc-500">days</span>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Periodic fields */}
          {timingMode === "periodic" && (
            <div className="space-y-4">
              {/* Periodic type selector */}
              <div>
                <label className="label">Frequency</label>
                <div className="inline-flex rounded-lg border border-zinc-200 p-0.5">
                  {PERIODIC_TYPES.map((pt) => (
                    <button
                      key={pt.value}
                      type="button"
                      onClick={() => {
                        setPeriodicType(pt.value);
                        if (pt.value === "weekly") setPeriodicSpec({ days: [] });
                        else if (pt.value === "monthly") setPeriodicSpec({ mode: "day_number", days: [] });
                        else if (pt.value === "yearly") setPeriodicSpec({ entries: [{ month: 1, day: 1 }] });
                        else setPeriodicSpec({ every_n: 1, unit: "days" });
                        markDirty();
                      }}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                        periodicType === pt.value
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "text-zinc-600 hover:text-zinc-900",
                      )}
                    >
                      {pt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Weekly: day-of-week chips */}
              {periodicType === "weekly" && (
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
                          getWeeklyDays(periodicSpec).includes(idx)
                            ? "border-indigo-300 bg-indigo-600 text-white"
                            : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                        )}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Monthly */}
              {periodicType === "monthly" && (
                <div className="space-y-3">
                  <div className="inline-flex rounded-lg border border-zinc-200 p-0.5">
                    <button
                      type="button"
                      onClick={() => { setPeriodicSpec({ mode: "day_number", days: getMonthlyDays(periodicSpec) }); markDirty(); }}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                        getMonthlyMode(periodicSpec) === "day_number"
                          ? "bg-zinc-700 text-white shadow-sm"
                          : "text-zinc-600 hover:text-zinc-900",
                      )}
                    >
                      By date
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPeriodicSpec({ mode: "ordinal", ordinal: 1, weekday: 0 }); markDirty(); }}
                      className={cn(
                        "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                        getMonthlyMode(periodicSpec) === "ordinal"
                          ? "bg-zinc-700 text-white shadow-sm"
                          : "text-zinc-600 hover:text-zinc-900",
                      )}
                    >
                      By pattern
                    </button>
                  </div>

                  {getMonthlyMode(periodicSpec) === "day_number" ? (
                    <div className="grid grid-cols-7 gap-1">
                      {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleMonthDay(day)}
                          className={cn(
                            "h-8 rounded border text-xs font-medium transition-all",
                            getMonthlyDays(periodicSpec).includes(day)
                              ? "border-indigo-300 bg-indigo-600 text-white"
                              : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                          )}
                        >
                          {day}
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <select
                        value={getMonthlyOrdinal(periodicSpec).ordinal}
                        onChange={(e) => setMonthlyOrdinalSpec(Number(e.target.value), getMonthlyOrdinal(periodicSpec).weekday)}
                        className="select w-auto text-sm"
                      >
                        {[1, 2, 3, 4].map((n) => (
                          <option key={n} value={n}>{["1st", "2nd", "3rd", "4th"][n - 1]}</option>
                        ))}
                        <option value={-1}>Last</option>
                      </select>
                      <select
                        value={getMonthlyOrdinal(periodicSpec).weekday}
                        onChange={(e) => setMonthlyOrdinalSpec(getMonthlyOrdinal(periodicSpec).ordinal, Number(e.target.value))}
                        className="select w-auto text-sm"
                      >
                        {WEEKDAYS.map((day, idx) => (
                          <option key={day} value={idx}>{day}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              {/* Yearly */}
              {periodicType === "yearly" && (
                <div className="space-y-2">
                  <label className="label">Dates</label>
                  {getYearlyEntries(periodicSpec).map((entry, idx) => (
                    <div key={idx} className="flex items-center gap-2">
                      <select
                        value={entry.month}
                        onChange={(e) => updateYearlyEntry(idx, "month", Number(e.target.value))}
                        className="select w-auto text-sm"
                      >
                        {MONTHS.map((m, i) => (
                          <option key={m} value={i + 1}>{m}</option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={entry.day}
                        onChange={(e) => updateYearlyEntry(idx, "day", Number(e.target.value))}
                        className="input w-20 text-sm"
                      />
                      {getYearlyEntries(periodicSpec).length > 1 && (
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
                  <button
                    type="button"
                    onClick={addYearlyEntry}
                    className="btn-ghost !px-2 !py-1 text-xs"
                  >
                    <Plus className="h-3.5 w-3.5" />
                    Add date
                  </button>
                </div>
              )}

              {/* Interval */}
              {periodicType === "interval" && (
                <div className="flex items-center gap-2">
                  <span className="text-sm text-zinc-600">Every</span>
                  <input
                    type="number"
                    min={1}
                    value={getIntervalSpec(periodicSpec).every_n}
                    onChange={(e) => setIntervalSpec(Number(e.target.value) || 1, getIntervalSpec(periodicSpec).unit)}
                    className="input w-20 text-sm"
                  />
                  <select
                    value={getIntervalSpec(periodicSpec).unit}
                    onChange={(e) => setIntervalSpec(getIntervalSpec(periodicSpec).every_n, e.target.value)}
                    className="select w-auto text-sm"
                  >
                    <option value="days">days</option>
                    <option value="weeks">weeks</option>
                  </select>
                </div>
              )}

              {/* Grace period for periodic */}
              <div>
                <label className="label">Grace period (optional)</label>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { setGraceDays(""); setCustomGrace(false); markDirty(); }}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition-all",
                      graceDays === ""
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                    )}
                  >
                    None
                  </button>
                  {GRACE_PRESETS.map((preset) => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => { setGraceDays(preset.value); setCustomGrace(false); markDirty(); }}
                      className={cn(
                        "rounded-lg border px-3 py-1.5 text-sm transition-all",
                        !customGrace && graceDays === preset.value
                          ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                          : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                      )}
                    >
                      {preset.label}
                    </button>
                  ))}
                  <button
                    type="button"
                    onClick={() => { setCustomGrace(true); if (typeof graceDays !== "number") setGraceDays(2); markDirty(); }}
                    className={cn(
                      "rounded-lg border px-3 py-1.5 text-sm transition-all",
                      customGrace
                        ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                        : "border-zinc-200 text-zinc-600 hover:border-zinc-300",
                    )}
                  >
                    Custom
                  </button>
                  {customGrace && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        value={graceDays}
                        onChange={(e) => { setGraceDays(e.target.value ? Number(e.target.value) : ""); markDirty(); }}
                        className="input w-20 text-sm"
                      />
                      <span className="text-sm text-zinc-500">days</span>
                    </div>
                  )}
                </div>
              </div>

              {/* Anchor start date */}
              <div>
                <label className="label">Start date (optional)</label>
                <input
                  type="date"
                  value={deadlineAt}
                  onChange={(e) => { setDeadlineAt(e.target.value); markDirty(); }}
                  className="input w-auto text-sm"
                />
              </div>

              {/* End condition */}
              <div>
                <label className="label">Ends</label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex rounded-lg border border-zinc-200 p-0.5">
                    {(["never", "until_date", "after_count"] as PeriodicEndMode[]).map((mode) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => { setPeriodicEndMode(mode); markDirty(); }}
                        className={cn(
                          "rounded-md px-3 py-1.5 text-sm font-medium transition-all",
                          periodicEndMode === mode
                            ? "bg-zinc-700 text-white shadow-sm"
                            : "text-zinc-600 hover:text-zinc-900",
                        )}
                      >
                        {mode === "never" ? "Never" : mode === "until_date" ? "Until" : "After"}
                      </button>
                    ))}
                  </div>
                  {periodicEndMode === "until_date" && (
                    <input
                      type="date"
                      value={periodicEndAt}
                      onChange={(e) => { setPeriodicEndAt(e.target.value); markDirty(); }}
                      className="input w-auto text-sm"
                    />
                  )}
                  {periodicEndMode === "after_count" && (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min={1}
                        value={periodicEndCount}
                        onChange={(e) => { setPeriodicEndCount(e.target.value ? Number(e.target.value) : ""); markDirty(); }}
                        className="input w-20 text-sm"
                      />
                      <span className="text-sm text-zinc-500">occurrences</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
          </div>
          )}
        </div>

        {/* Checklist */}
        <div className="border-t border-zinc-100 px-6 py-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-700">Checklist</h3>
          <div className="space-y-2">
            {checklist.map((item, idx) => (
              <div key={`${item.title}-${idx}`} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={item.is_done}
                  onChange={() => toggleChecklistItem(idx)}
                  className="h-4 w-4 rounded border-zinc-300 text-indigo-600 focus:ring-indigo-500"
                />
                <span
                  className={cn(
                    "flex-1 text-sm",
                    item.is_done ? "text-zinc-400 line-through" : "text-zinc-700",
                  )}
                >
                  {item.title}
                </span>
                <button
                  onClick={() => removeChecklistItem(idx)}
                  className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-red-600"
                  title="Remove item"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
            <div className="flex items-center gap-2 pt-1">
              <input
                value={newChecklistItem}
                onChange={(e) => setNewChecklistItem(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addChecklistItem(); } }}
                className="input flex-1 !py-1.5 text-sm"
                placeholder="Add checklist item"
              />
              <button onClick={addChecklistItem} className="btn-ghost !px-2 !py-1.5 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Linked Drivers */}
        <div className="border-t border-zinc-100 px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-zinc-400" />
              <h3 className="text-sm font-medium text-zinc-700">Linked Drivers</h3>
            </div>
            {!showDriverPicker && (
              <button onClick={() => setShowDriverPicker(true)} className="btn-ghost !px-2 !py-1 text-xs">
                <Plus className="h-3.5 w-3.5" />
                Link
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {linkedDrivers?.map((driver) => (
              <div
                key={driver.id}
                className="group flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5"
              >
                <DriverTypeBadge type={driver.driver_type} />
                <span className="text-sm text-zinc-700">{driver.title}</span>
                <button
                  onClick={() => handleUnlinkDriver(driver.id)}
                  className="ml-1 rounded p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {linkedDrivers?.length === 0 && !showDriverPicker && (
              <p className="text-xs italic text-zinc-400">No drivers linked</p>
            )}
          </div>
          {showDriverPicker && (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="mb-2 text-xs font-medium text-zinc-500">Select a driver to link:</p>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {availableDrivers?.map((driver) => (
                  <button
                    key={driver.id}
                    onClick={() => handleLinkDriver(driver.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white"
                  >
                    <DriverTypeBadge type={driver.driver_type} />
                    <span className="text-zinc-700">{driver.title}</span>
                  </button>
                ))}
                {availableDrivers?.length === 0 && (
                  <p className="text-xs text-zinc-400">No more drivers to link</p>
                )}
              </div>
              <button onClick={() => setShowDriverPicker(false)} className="btn-ghost mt-2 w-full text-xs">
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Reasons */}
        {!isNew && taskId && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <ReasonSection
              reasons={reasons}
              isLoading={reasonsLoading}
              onAdd={(text) => addReasonMutation.mutate({ taskId, data: { reason_text: text } })}
              onUpdate={(reasonId, text) =>
                updateReasonMutation.mutate({ reasonId, taskId, data: { reason_text: text } })
              }
              onDelete={(reasonId) => deleteReasonMutation.mutate({ reasonId, taskId })}
              isAdding={addReasonMutation.isPending}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/80 px-6 py-4">
          <div className="text-xs text-zinc-400">
            {task && (
              <>
                Created {formatDate(task.created_at)} &middot; Updated{" "}
                {formatDate(task.updated_at)} &middot; v{task.version}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && (
              <button
                onClick={handleArchive}
                disabled={archiveMutation.isPending}
                className="btn-danger text-xs"
              >
                <Archive className="h-3.5 w-3.5" />
                Archive
              </button>
            )}
            <button
              onClick={handleSave}
              disabled={isSaving || !title.trim() || (!isNew && !dirty)}
              className="btn-primary"
            >
              <Save className="h-4 w-4" />
              {isNew ? "Create Task" : "Save Changes"}
            </button>
          </div>
        </div>

        {(createMutation.error || updateMutation.error) && (
          <div className="border-t border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
            {(createMutation.error as Error)?.message ||
              (updateMutation.error as Error)?.message}
          </div>
        )}
      </div>
    </div>
  );
}
