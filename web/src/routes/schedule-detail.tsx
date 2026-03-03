import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router";
import {
  ArrowLeft,
  Save,
  Archive,
  Link2,
  Plus,
  X,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Repeat,
  ListChecks,
  Trash2,
} from "lucide-react";
import {
  useArchiveSchedule,
  useAddScheduleReason,
  useCreateSchedule,
  useDrivers,
  useInitiatives,
  useTask,
  useTasks,
  useLinkScheduleDrivers,
  useSchedule,
  useScheduleReasons,
  useDeleteScheduleReason,
  useUnlinkScheduleDriver,
  useUpdateSchedule,
  useUpdateScheduleReason,
} from "../lib/hooks";
import type {
  ScheduleType,
  Block,
  PeriodicEndMode,
  PeriodicSpec,
  PeriodicType,
} from "../lib/types";
import { DriverTypeBadge } from "../components/badges";
import { TimeInput } from "../components/timing-editor";
import { ReasonSection } from "../components/reason-section";
import { LoadingSpinner } from "../components/loading";
import { showToast } from "../components/toast";
import { formatDate, cn, generateOccurrences, formatTime12hPublic } from "../lib/utils";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");

function toDateValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function toTimeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function composeDatetime(date: string, time: string): string | null {
  if (!date || !time) return null;
  return new Date(`${date}T${time}`).toISOString();
}

const SCHEDULE_TYPE_OPTIONS: { value: ScheduleType; label: string; icon: typeof CalendarClock }[] = [
  { value: "block_set", label: "Block Set", icon: CalendarClock },
  { value: "periodic", label: "Periodic", icon: Repeat },
  { value: "task", label: "Task", icon: ListChecks },
];

// ── Page shell ───────────────────────────────────────────────────────────────

export function ScheduleDetailPage() {
  const { scheduleId } = useParams<{ scheduleId: string }>();
  const isNew = !scheduleId;
  const { data: schedule, isLoading } = useSchedule(scheduleId);

  if (!isNew && isLoading) {
    return (
      <div className="animate-fade-in">
        <Link to="/schedules" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Schedules
        </Link>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isNew && !schedule) {
    return (
      <div className="animate-fade-in">
        <Link to="/schedules" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Schedules
        </Link>
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-zinc-500">Schedule not found</p>
        </div>
      </div>
    );
  }

  return <ScheduleDetailForm key={scheduleId ?? "new"} scheduleId={scheduleId} isNew={isNew} />;
}

// ── Form component ───────────────────────────────────────────────────────────

function ScheduleDetailForm({ scheduleId, isNew }: { scheduleId?: string; isNew: boolean }) {
  const navigate = useNavigate();

  const { data: schedule } = useSchedule(scheduleId);
  const { data: initiatives } = useInitiatives();
  const { data: allTasks } = useTasks();
  const { data: drivers } = useDrivers();
  const { data: reasons = [], isLoading: reasonsLoading } = useScheduleReasons(scheduleId);

  const createMutation = useCreateSchedule();
  const updateMutation = useUpdateSchedule();
  const archiveMutation = useArchiveSchedule();
  const linkDriversMutation = useLinkScheduleDrivers();
  const unlinkDriverMutation = useUnlinkScheduleDriver();
  const addReasonMutation = useAddScheduleReason();
  const updateReasonMutation = useUpdateScheduleReason();
  const deleteReasonMutation = useDeleteScheduleReason();

  const [title, setTitle] = useState(schedule?.title ?? "");
  const [description, setDescription] = useState(schedule?.description ?? "");
  const [initiativeId, setInitiativeId] = useState(schedule?.initiative_id ?? "");
  const [taskId, setTaskId] = useState(schedule?.task_id ?? "");

  const [scheduleType, setScheduleType] = useState<ScheduleType>(schedule?.schedule_type ?? "block_set");

  // Periodic fields
  const [recurDate, setRecurDate] = useState(toDateValue(schedule?.starts_at ?? null));
  const [recurStartTime, setRecurStartTime] = useState(toTimeValue(schedule?.starts_at ?? null));
  const [recurEndTime, setRecurEndTime] = useState(toTimeValue(schedule?.ends_at ?? null));
  const [periodicType, setPeriodicType] = useState<PeriodicType>(schedule?.periodic_type ?? "weekly");
  const [periodicSpec, setPeriodicSpec] = useState<PeriodicSpec>(schedule?.periodic_spec ?? { days: [] });
  const [periodicEndMode, setPeriodicEndMode] = useState<PeriodicEndMode>(schedule?.periodic_end_mode ?? "never");
  const [periodicEndAt, setPeriodicEndAt] = useState(toDateValue(schedule?.periodic_end_at ?? null));
  const [periodicEndCount, setPeriodicEndCount] = useState<number | "">(schedule?.periodic_end_count ?? "");

  // Blocks (used by both block_set and task types)
  const [blocks, setBlocks] = useState<Block[]>(schedule?.blocks_json ?? []);

  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>(schedule?.driver_ids ?? []);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  // Fetch linked task for task-type blocks
  const linkedTaskId = scheduleType === "task" ? taskId : undefined;
  const { data: linkedTask } = useTask(linkedTaskId || undefined);

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  const canSave = (() => {
    if (!title.trim()) return false;
    if (scheduleType === "block_set") return blocks.length > 0;
    if (scheduleType === "periodic") return !!recurDate && !!recurStartTime && !!recurEndTime;
    if (scheduleType === "task") return !!taskId;
    return false;
  })();

  async function handleSave() {
    if (!canSave) return;

    let computedStartsAt: string;
    let computedEndsAt: string;

    if (scheduleType === "block_set") {
      const starts = blocks.map((b) => b.starts_at).sort();
      const ends = blocks.map((b) => b.ends_at).sort();
      computedStartsAt = starts[0];
      computedEndsAt = ends[ends.length - 1];
    } else if (scheduleType === "periodic") {
      computedStartsAt = composeDatetime(recurDate, recurStartTime)!;
      computedEndsAt = composeDatetime(recurDate, recurEndTime)!;
    } else {
      const now = new Date().toISOString();
      computedStartsAt = now;
      computedEndsAt = now;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      schedule_type: scheduleType,
      starts_at: computedStartsAt,
      ends_at: computedEndsAt,
      initiative_id: initiativeId || null,
      task_id: scheduleType === "task" ? (taskId || null) : null,
      blocks_json: (scheduleType === "task" || scheduleType === "block_set") ? blocks : [],
      periodic_type: scheduleType === "periodic" ? periodicType : null,
      periodic_spec: scheduleType === "periodic" ? periodicSpec : null,
      periodic_end_mode: scheduleType === "periodic" ? periodicEndMode : null,
      periodic_end_at:
        scheduleType === "periodic" && periodicEndMode === "until_date" && periodicEndAt
          ? new Date(periodicEndAt + "T23:59:59").toISOString()
          : null,
      periodic_end_count:
        scheduleType === "periodic" && periodicEndMode === "after_count"
          ? (periodicEndCount || null)
          : null,
    };

    try {
      if (isNew) {
        const created = await createMutation.mutateAsync({
          ...payload,
          driver_ids: selectedDriverIds.length > 0 ? selectedDriverIds : undefined,
        });
        showToast("success", "Schedule created");
        navigate(`/schedules/${created.id}`, { replace: true });
      } else if (scheduleId) {
        await updateMutation.mutateAsync({ id: scheduleId, data: payload });
        setDirty(false);
        showToast("success", "Changes saved");
      }
    } catch (err) {
      showToast("error", (err as Error).message || "Failed to save");
    }
  }

  function handleArchive() {
    if (!scheduleId) return;
    if (confirm("Archive this schedule?")) {
      archiveMutation.mutate(scheduleId, {
        onSuccess: () => {
          showToast("success", "Schedule archived");
          navigate("/schedules");
        },
        onError: (err) => showToast("error", err.message),
      });
    }
  }

  function handleLinkDriver(driverId: string) {
    if (!scheduleId) {
      setSelectedDriverIds((prev) => [...prev, driverId]);
      markDirty();
    } else {
      linkDriversMutation.mutate(
        { scheduleId: scheduleId, data: { driver_ids: [driverId] } },
        { onError: (err) => showToast("error", err.message) },
      );
    }
    setShowDriverPicker(false);
  }

  function handleUnlinkDriver(driverId: string) {
    if (!scheduleId) {
      setSelectedDriverIds((prev) => prev.filter((id) => id !== driverId));
      markDirty();
    } else {
      unlinkDriverMutation.mutate(
        { scheduleId: scheduleId, driverId },
        { onError: (err) => showToast("error", err.message) },
      );
    }
  }

  function getWeeklyDays(): number[] {
    return Array.isArray((periodicSpec as { days?: number[] })?.days)
      ? ((periodicSpec as { days: number[] }).days)
      : [];
  }

  function toggleWeeklyDay(day: number) {
    const days = getWeeklyDays();
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day].sort();
    setPeriodicSpec({ days: next });
    markDirty();
  }

  function getMonthlyDays(): number[] {
    return Array.isArray((periodicSpec as { days?: number[] })?.days)
      ? ((periodicSpec as { days: number[] }).days)
      : [];
  }

  function toggleMonthlyDay(day: number) {
    const days = getMonthlyDays();
    const next = days.includes(day)
      ? days.filter((d) => d !== day)
      : [...days, day].sort((a, b) => a - b);
    setPeriodicSpec({ days: next });
    markDirty();
  }

  const linkedDriverIds = useMemo(
    () => new Set(isNew ? selectedDriverIds : (schedule?.driver_ids ?? selectedDriverIds)),
    [isNew, selectedDriverIds, schedule?.driver_ids],
  );
  const availableDrivers = drivers?.filter(
    (driver) => !linkedDriverIds.has(driver.id) && !driver.deleted_at && driver.state !== "archived",
  );
  const linkedDrivers = drivers?.filter((driver) => linkedDriverIds.has(driver.id));

  return (
    <div className="animate-fade-in">
      <Link to="/schedules" className="btn-ghost mb-4 !px-0 text-zinc-500">
        <ArrowLeft className="h-4 w-4" />
        Back to Schedules
      </Link>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {/* Title */}
        <div className="px-6 pt-6">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty(); }}
            placeholder="Schedule title"
            className="w-full border-none bg-transparent text-xl font-semibold text-zinc-900 outline-none placeholder:text-zinc-300"
            autoFocus={isNew}
          />
        </div>

        {/* Block type selector */}
        <div className="px-6 py-4">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            {SCHEDULE_TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => {
                    setScheduleType(opt.value);
                    if (opt.value !== scheduleType) setBlocks([]);
                    markDirty();
                  }}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all",
                    scheduleType === opt.value
                      ? "bg-white text-zinc-900 shadow-sm"
                      : "text-zinc-500 hover:text-zinc-700",
                  )}
                >
                  <Icon className="h-3.5 w-3.5" />
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Block Set scheduling ────────────────────────────────────────── */}
        {scheduleType === "block_set" && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <FreeformBlocksEditor
              blocks={blocks}
              onChange={(next) => { setBlocks(next); markDirty(); }}
            />
          </div>
        )}

        {/* ── Periodic scheduling ──────────────────────────────────────── */}
        {scheduleType === "periodic" && (
          <div className="border-t border-zinc-100 px-6 py-4 space-y-5">
            <div className="space-y-4 rounded-lg border border-zinc-200 bg-zinc-50/50 p-4">
              <div>
                <label className="label">Frequency</label>
                <select
                  value={periodicType}
                  onChange={(e) => {
                    const t = e.target.value as PeriodicType;
                    setPeriodicType(t);
                    if (t === "weekly") setPeriodicSpec({ days: [] });
                    else if (t === "monthly") setPeriodicSpec({ days: [] });
                    else if (t === "yearly") setPeriodicSpec({ entries: [{ month: 1, day: 1 }] });
                    else setPeriodicSpec({ every_n_days: 7 });
                    markDirty();
                  }}
                  className="select w-auto text-sm"
                >
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                  <option value="yearly">Yearly</option>
                  <option value="interval">Every N days</option>
                </select>
              </div>

              {periodicType === "weekly" && (
                <div>
                  <label className="label">Days</label>
                  <div className="flex gap-1">
                    {WEEKDAYS.map((label, i) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleWeeklyDay(i)}
                        className={cn(
                          "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                          getWeeklyDays().includes(i)
                            ? "bg-indigo-600 text-white"
                            : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {periodicType === "monthly" && (
                <div>
                  <label className="label">Days of month</label>
                  <div className="flex flex-wrap gap-1">
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => {
                      const active = getMonthlyDays().includes(day);
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleMonthlyDay(day)}
                          className={cn(
                            "h-7 w-7 rounded text-xs font-medium transition-colors",
                            active
                              ? "bg-indigo-600 text-white"
                              : "bg-zinc-100 text-zinc-500 hover:bg-zinc-200",
                          )}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {periodicType === "yearly" && (
                <div>
                  <label className="label">Date(s) each year</label>
                  {((periodicSpec as { entries?: { month: number; day: number }[] })?.entries ?? [{ month: 1, day: 1 }]).map(
                    (entry, idx) => {
                      const y = new Date().getFullYear();
                      const dateVal = `${y}-${pad(entry.month)}-${pad(entry.day)}`;
                      return (
                        <div key={idx} className="mt-1 flex items-center gap-2">
                          <input
                            type="date"
                            value={dateVal}
                            onChange={(e) => {
                              if (!e.target.value) return;
                              const d = new Date(e.target.value + "T00:00:00");
                              const entries = (periodicSpec as { entries?: { month: number; day: number }[] })?.entries ?? [];
                              const updated = entries.map((en, i) =>
                                i === idx ? { month: d.getMonth() + 1, day: d.getDate() } : en,
                              );
                              setPeriodicSpec({ entries: updated });
                              markDirty();
                            }}
                            className="input w-auto text-sm"
                          />
                        </div>
                      );
                    },
                  )}
                </div>
              )}

              {periodicType === "interval" && (
                <div>
                  <label className="label">Every</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      value={(periodicSpec as { every_n_days?: number })?.every_n_days ?? 7}
                      onChange={(e) => {
                        setPeriodicSpec({ every_n_days: parseInt(e.target.value) || 1 });
                        markDirty();
                      }}
                      className="input w-20 text-sm"
                    />
                    <span className="text-sm text-zinc-500">days</span>
                  </div>
                </div>
              )}
            </div>

            {/* Time window */}
            <div>
              <label className="label">Time window</label>
              <div className="flex items-center gap-2">
                <TimeInput
                  value={recurStartTime}
                  onChange={(v) => { setRecurStartTime(v); markDirty(); }}
                />
                <span className="text-sm text-zinc-400">to</span>
                <TimeInput
                  value={recurEndTime}
                  onChange={(v) => { setRecurEndTime(v); markDirty(); }}
                />
              </div>
            </div>

            {/* Start date + end condition */}
            <div className="flex flex-wrap items-end gap-4">
              <div>
                <label className="label">Starting from</label>
                <input
                  type="date"
                  value={recurDate}
                  onChange={(e) => { setRecurDate(e.target.value); markDirty(); }}
                  className="input w-auto text-sm"
                />
              </div>
              <div>
                <label className="label">Ends</label>
                <select
                  value={periodicEndMode}
                  onChange={(e) => { setPeriodicEndMode(e.target.value as PeriodicEndMode); markDirty(); }}
                  className="select w-auto text-sm"
                >
                  <option value="never">Never</option>
                  <option value="until_date">On date</option>
                  <option value="after_count">After count</option>
                </select>
              </div>
              {periodicEndMode === "until_date" && (
                <div>
                  <label className="label">End date</label>
                  <input
                    type="date"
                    value={periodicEndAt}
                    onChange={(e) => { setPeriodicEndAt(e.target.value); markDirty(); }}
                    className="input w-auto text-sm"
                  />
                </div>
              )}
              {periodicEndMode === "after_count" && (
                <div>
                  <label className="label">Occurrences</label>
                  <input
                    type="number"
                    min={1}
                    value={periodicEndCount}
                    onChange={(e) => { setPeriodicEndCount(e.target.value ? parseInt(e.target.value) : ""); markDirty(); }}
                    className="input w-24 text-sm"
                  />
                </div>
              )}
            </div>
          </div>
        )}

        {/* ── Task-type configuration ─────────────────────────────────── */}
        {scheduleType === "task" && (
          <div className="border-t border-zinc-100 px-6 py-4 space-y-4">
            <div>
              <label className="label">Linked Task</label>
              <select
                value={taskId}
                onChange={(e) => {
                  const newId = e.target.value;
                  setTaskId(newId);
                  setBlocks([]);
                  const selectedTask = allTasks?.find((t) => t.id === newId);
                  if (selectedTask && (!title.trim() || title.startsWith("Schedule: "))) {
                    setTitle(`Schedule: ${selectedTask.title}`);
                  }
                  markDirty();
                }}
                className="select w-full text-sm"
              >
                <option value="">Select a task...</option>
                {allTasks
                  ?.filter((t) => !t.deleted_at && t.status !== "archived")
                  .map((t) => (
                    <option key={t.id} value={t.id}>{t.title}</option>
                  ))}
              </select>
            </div>

            {linkedTask && (
              <TaskBlocksEditor
                task={linkedTask}
                blocks={blocks}
                onChange={(next) => { setBlocks(next); markDirty(); }}
              />
            )}
          </div>
        )}

        {/* Initiative (for block_set and periodic) */}
        {scheduleType !== "task" && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <div className="flex flex-wrap gap-4">
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
          </div>
        )}

        {/* Description */}
        <div className="border-t border-zinc-100 px-6 py-4">
          <label className="label">Description</label>
          <textarea
            value={description}
            onChange={(e) => { setDescription(e.target.value); markDirty(); }}
            placeholder="Add a description..."
            rows={4}
            className="input resize-none text-sm"
          />
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
        {!isNew && scheduleId && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <ReasonSection
              reasons={reasons}
              isLoading={reasonsLoading}
              onAdd={(text) => addReasonMutation.mutate({ scheduleId: scheduleId, data: { reason_text: text } })}
              onUpdate={(reasonId, text) =>
                updateReasonMutation.mutate({ reasonId, scheduleId: scheduleId, data: { reason_text: text } })
              }
              onDelete={(reasonId) => deleteReasonMutation.mutate({ reasonId, scheduleId: scheduleId })}
              isAdding={addReasonMutation.isPending}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/80 px-6 py-4">
          <div className="text-xs text-zinc-400">
            {schedule && (
              <>
                Created {formatDate(schedule.created_at)} &middot; Updated{" "}
                {formatDate(schedule.updated_at)} &middot; v{schedule.version}
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
              disabled={isSaving || !canSave || (!isNew && !dirty)}
              className="btn-primary"
            >
              <Save className="h-4 w-4" />
              {isNew ? "Create Schedule" : "Save Changes"}
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

// ── Task Spans Editor ────────────────────────────────────────────────────────

interface TaskForBlocks {
  timing_mode: string;
  periodic_type: PeriodicType | null;
  periodic_spec: PeriodicSpec | null;
  deadline_at: string | null;
  periodic_end_mode: PeriodicEndMode | null;
  periodic_end_at: string | null;
  periodic_end_count: number | null;
}

function TaskBlocksEditor({
  task,
  blocks,
  onChange,
}: {
  task: TaskForBlocks;
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}) {
  const isPeriodic = task.timing_mode === "periodic" && task.periodic_type;

  if (isPeriodic) {
    return (
      <OccurrenceBlocksEditor
        task={task}
        blocks={blocks}
        onChange={onChange}
      />
    );
  }

  return (
    <FreeformBlocksEditor blocks={blocks} onChange={onChange} />
  );
}

// ── Freeform Spans Editor (non-periodic tasks) ──────────────────────────────

function FreeformBlocksEditor({
  blocks,
  onChange,
}: {
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}) {
  function addBlock() {
    const today = new Date().toISOString().slice(0, 10);
    const inst: Block = {
      starts_at: new Date(`${today}T09:00:00`).toISOString(),
      ends_at: new Date(`${today}T10:00:00`).toISOString(),
    };
    onChange([...blocks, inst]);
  }

  function updateBlock(index: number, field: "starts_at" | "ends_at", value: string) {
    const updated = blocks.map((s, i) => (i === index ? { ...s, [field]: value } : s));
    onChange(updated);
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-700">Blocks</h4>
        <button
          type="button"
          onClick={addBlock}
          className="flex items-center gap-1 rounded-md bg-indigo-50 px-2.5 py-1 text-xs font-medium text-indigo-600 hover:bg-indigo-100 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add block
        </button>
      </div>

      {blocks.length === 0 && (
        <p className="text-xs italic text-zinc-400">No blocks scheduled yet. Add one to reserve time.</p>
      )}

      {blocks.map((inst, idx) => {
        const sDate = toDateValue(inst.starts_at);
        const sTime = toTimeValue(inst.starts_at) || "09:00";
        const eDate = toDateValue(inst.ends_at);
        const eTime = toTimeValue(inst.ends_at) || "10:00";
        return (
          <div key={idx} className="flex items-end gap-2 rounded-lg border border-zinc-200 bg-zinc-50/50 p-3">
            <div>
              <label className="label">From</label>
              <input
                type="date"
                value={sDate}
                onChange={(e) => {
                  const val = composeDatetime(e.target.value, sTime) ?? inst.starts_at;
                  updateBlock(idx, "starts_at", val);
                }}
                className="input w-auto text-sm"
              />
            </div>
            <div>
              <TimeInput
                value={sTime}
                onChange={(t) => {
                  const val = composeDatetime(sDate, t) ?? inst.starts_at;
                  updateBlock(idx, "starts_at", val);
                }}
              />
            </div>
            <div>
              <label className="label">To</label>
              <input
                type="date"
                value={eDate}
                onChange={(e) => {
                  const val = composeDatetime(e.target.value, eTime) ?? inst.ends_at;
                  updateBlock(idx, "ends_at", val);
                }}
                className="input w-auto text-sm"
              />
            </div>
            <div>
              <TimeInput
                value={eTime}
                onChange={(t) => {
                  const val = composeDatetime(eDate, t) ?? inst.ends_at;
                  updateBlock(idx, "ends_at", val);
                }}
              />
            </div>
            <button
              type="button"
              onClick={() => removeBlock(idx)}
              className="mb-0.5 rounded p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              title="Remove block"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

// ── Period Slot Extraction ───────────────────────────────────────────────────

const WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

interface PeriodSlot {
  key: string;
  label: string;
}

function ordinalSuffix(n: number): string {
  if (n >= 11 && n <= 13) return n + "th";
  const last = n % 10;
  if (last === 1) return n + "st";
  if (last === 2) return n + "nd";
  if (last === 3) return n + "rd";
  return n + "th";
}

const ORDINAL_LABELS = ["", "1st", "2nd", "3rd", "4th", "last"];

const MONTH_NAMES_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAY_SHORT = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function extractPeriodSlots(
  periodicType: string,
  periodicSpec: PeriodicSpec | null,
): PeriodSlot[] {
  if (!periodicSpec) return [];

  if (periodicType === "weekly") {
    const days = Array.isArray(periodicSpec.days) ? (periodicSpec.days as number[]) : [];
    return days.map((d) => ({
      key: `w${d}`,
      label: WEEKDAY_NAMES[d] ?? `Day ${d}`,
    }));
  }

  if (periodicType === "monthly") {
    const mode = periodicSpec.mode as string | undefined;
    if (mode === "ordinal") {
      const ordinal = (periodicSpec.ordinal as number) ?? 1;
      const weekday = (periodicSpec.weekday as number) ?? 0;
      const ordLabel = ordinal === -1 ? "Last" : (ORDINAL_LABELS[ordinal] ?? `${ordinal}th`);
      const dayLabel = WEEKDAY_NAMES[weekday] ?? `Day ${weekday}`;
      return [{ key: `ord_${ordinal}_${weekday}`, label: `${ordLabel} ${dayLabel}` }];
    }
    const days = Array.isArray(periodicSpec.days) ? (periodicSpec.days as number[]) : [];
    return days.map((d) => ({
      key: `m${d}`,
      label: ordinalSuffix(d),
    }));
  }

  if (periodicType === "yearly") {
    const entries = Array.isArray(periodicSpec.entries)
      ? (periodicSpec.entries as { month: number; day: number }[])
      : [];
    return entries.map((e) => ({
      key: `y${e.month}_${e.day}`,
      label: `${MONTH_NAMES[e.month] ?? `Month ${e.month}`} ${e.day}`,
    }));
  }

  if (periodicType === "interval") {
    const everyN = (periodicSpec.every_n_days as number) ?? (periodicSpec.every_n as number) ?? 1;
    return [{ key: "interval", label: `Every ${everyN} days` }];
  }

  return [];
}

function offsetBounds(periodicType: string | null, periodicSpec: PeriodicSpec | null): { min: number; max: number } {
  if (periodicType === "weekly") return { min: -6, max: 6 };
  if (periodicType === "monthly") return { min: -14, max: 14 };
  if (periodicType === "yearly") return { min: -30, max: 30 };
  if (periodicType === "interval") {
    const n = (periodicSpec?.every_n_days as number) ?? (periodicSpec?.every_n as number) ?? 1;
    const bound = Math.max(1, n - 1);
    return { min: -bound, max: bound };
  }
  return { min: -7, max: 7 };
}

function nextOccurrencesForSlot(
  task: TaskForBlocks,
  slotKey: string,
  count: number,
): string[] {
  if (!task.periodic_type || !task.periodic_spec) return [];

  const allOccs = generateOccurrences(
    {
      periodic_type: task.periodic_type,
      periodic_spec: task.periodic_spec,
      deadline_at: task.deadline_at,
      periodic_end_mode: task.periodic_end_mode,
      periodic_end_at: task.periodic_end_at,
      periodic_end_count: task.periodic_end_count,
    },
    count * 10,
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const future = allOccs.filter((d) => new Date(d) >= today);

  if (task.periodic_type === "weekly") {
    const dayIdx = parseInt(slotKey.replace("w", ""), 10);
    return future
      .filter((ymd) => {
        const d = new Date(ymd);
        return (d.getDay() + 6) % 7 === dayIdx;
      })
      .slice(0, count);
  }

  if (task.periodic_type === "monthly") {
    if (slotKey.startsWith("ord_")) {
      return future.slice(0, count);
    }
    const dayOfMonth = parseInt(slotKey.replace("m", ""), 10);
    return future
      .filter((ymd) => new Date(ymd).getDate() === dayOfMonth)
      .slice(0, count);
  }

  if (task.periodic_type === "yearly") {
    const parts = slotKey.replace("y", "").split("_");
    const month = parseInt(parts[0] ?? "1", 10);
    const day = parseInt(parts[1] ?? "1", 10);
    return future
      .filter((ymd) => {
        const d = new Date(ymd);
        return d.getMonth() + 1 === month && d.getDate() === day;
      })
      .slice(0, count);
  }

  return future.slice(0, count);
}

function formatShortDate(ymd: string): string {
  const d = new Date(ymd + "T00:00:00");
  return `${WEEKDAY_SHORT[d.getDay()]} ${MONTH_NAMES_SHORT[d.getMonth()]} ${d.getDate()}`;
}

function formatOffsetLabel(n: number): string {
  if (n === 0) return "same day";
  if (n === -1) return "1 day before";
  if (n < -1) return `${Math.abs(n)} days before`;
  if (n === 1) return "1 day after";
  return `${n} days after`;
}

function applyOffset(ymd: string, offset: number): string {
  const d = new Date(ymd + "T00:00:00");
  d.setDate(d.getDate() + offset);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// ── Slot-based Instance Editor (periodic tasks) ─────────────────────────────

function OccurrenceBlocksEditor({
  task,
  blocks,
  onChange,
}: {
  task: TaskForBlocks;
  blocks: Block[];
  onChange: (blocks: Block[]) => void;
}) {
  const periodicType = task.periodic_type;

  const slots = useMemo(() => {
    if (!periodicType || !task.periodic_spec) return [];
    return extractPeriodSlots(periodicType, task.periodic_spec);
  }, [periodicType, task.periodic_spec]);

  const bounds = useMemo(
    () => offsetBounds(periodicType, task.periodic_spec),
    [periodicType, task.periodic_spec],
  );

  function getBlockForSlot(key: string): Block | undefined {
    return blocks.find((s) => s.slot_key === key);
  }

  function setBlockForSlot(key: string, offset: number, startTime: string, endTime: string) {
    const clamped = Math.max(bounds.min, Math.min(bounds.max, offset));
    const today = new Date().toISOString().slice(0, 10);
    const startsAt = new Date(`${today}T${startTime}:00`).toISOString();
    const endsAt = new Date(`${today}T${endTime}:00`).toISOString();
    const inst: Block = { starts_at: startsAt, ends_at: endsAt, slot_key: key, offset_days: clamped };
    const existing = blocks.findIndex((s) => s.slot_key === key);
    if (existing >= 0) {
      onChange(blocks.map((s, i) => (i === existing ? inst : s)));
    } else {
      onChange([...blocks, inst]);
    }
  }

  function clearBlockForSlot(key: string) {
    onChange(blocks.filter((s) => s.slot_key !== key));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-medium text-zinc-700">Schedule per occurrence</h4>
        <span className="text-xs text-zinc-400">
          {blocks.length} of {slots.length} configured
        </span>
      </div>

      {slots.length === 0 && (
        <p className="text-xs italic text-zinc-400">
          No periodic slots found. Check the task's periodic schedule.
        </p>
      )}

      <div className="space-y-2">
        {slots.map((slot) => (
          <SlotBlockRow
            key={slot.key}
            slot={slot}
            task={task}
            bounds={bounds}
            block={getBlockForSlot(slot.key)}
            onSet={(offset, start, end) => setBlockForSlot(slot.key, offset, start, end)}
            onClear={() => clearBlockForSlot(slot.key)}
          />
        ))}
      </div>
    </div>
  );
}

function SlotBlockRow({
  slot,
  task,
  bounds,
  block,
  onSet,
  onClear,
}: {
  slot: PeriodSlot;
  task: TaskForBlocks;
  bounds: { min: number; max: number };
  block: Block | undefined;
  onSet: (offset: number, startTime: string, endTime: string) => void;
  onClear: () => void;
}) {
  const offset = block?.offset_days ?? 0;
  const startTime = block ? toTimeValue(block.starts_at) : "09:00";
  const endTime = block ? toTimeValue(block.ends_at) : "10:00";

  const preview = useMemo(() => {
    if (!block) return [];
    const occs = nextOccurrencesForSlot(task, slot.key, 2);
    return occs.map((occ) => {
      const blockDay = applyOffset(occ, offset);
      return { occLabel: formatShortDate(occ), blockLabel: formatShortDate(blockDay), sameDay: offset === 0 };
    });
  }, [block, task, slot.key, offset]);

  if (!block) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-dashed border-zinc-200 bg-white px-4 py-3">
        <span className="text-sm text-zinc-500">{slot.label}</span>
        <button
          type="button"
          onClick={() => onSet(0, "09:00", "10:00")}
          className="flex items-center gap-1.5 rounded-md bg-zinc-100 px-3 py-1.5 text-xs font-medium text-zinc-600 hover:bg-indigo-50 hover:text-indigo-600 transition-colors"
        >
          <Plus className="h-3 w-3" />
          Add block
        </button>
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-indigo-200 bg-white shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between bg-indigo-50/70 px-4 py-2">
        <span className="text-sm font-medium text-indigo-900">{slot.label}</span>
        <button
          type="button"
          onClick={onClear}
          className="rounded p-0.5 text-zinc-400 hover:text-red-500 transition-colors"
          title="Remove block"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>

      {/* Controls */}
      <div className="px-4 py-3 space-y-3">
        {/* Day offset stepper */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-500 w-16 shrink-0">Day</span>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={() => onSet(Math.max(bounds.min, offset - 1), startTime, endTime)}
              disabled={offset <= bounds.min}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span
              className={cn(
                "min-w-[5rem] text-center text-sm font-medium rounded-md px-2 py-1",
                offset === 0
                  ? "text-zinc-600 bg-zinc-100"
                  : "text-amber-700 bg-amber-50",
              )}
            >
              {formatOffsetLabel(offset)}
            </span>
            <button
              type="button"
              onClick={() => onSet(Math.min(bounds.max, offset + 1), startTime, endTime)}
              disabled={offset >= bounds.max}
              className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
          <span className="text-[10px] text-zinc-400">{bounds.min} to {bounds.max}</span>
        </div>

        {/* Time range */}
        <div className="flex items-center gap-3">
          <span className="text-xs font-medium text-zinc-500 w-16 shrink-0">Time</span>
          <TimeInput
            value={startTime}
            onChange={(v) => onSet(offset, v, endTime)}
            className="!py-1 text-sm"
          />
          <span className="text-xs text-zinc-400">to</span>
          <TimeInput
            value={endTime}
            onChange={(v) => onSet(offset, startTime, v)}
            className="!py-1 text-sm"
          />
        </div>
      </div>

      {/* Preview */}
      {preview.length > 0 && (
        <div className="border-t border-zinc-100 px-4 py-2 bg-zinc-50/50">
          <p className="text-[10px] uppercase tracking-wider text-zinc-400 mb-1">Next occurrences</p>
          <div className="space-y-0.5">
            {preview.map((p, i) => (
              <div key={i} className="flex items-center gap-2 text-xs">
                {!p.sameDay && (
                  <>
                    <span className="text-zinc-400">{p.occLabel}</span>
                    <span className="text-zinc-300">&rarr;</span>
                  </>
                )}
                <span className="font-medium text-zinc-600">{p.blockLabel}</span>
                <span className="text-zinc-400">
                  {formatTime12hPublic(startTime)}&ndash;{formatTime12hPublic(endTime)}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
