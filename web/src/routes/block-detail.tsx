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
  Repeat,
} from "lucide-react";
import {
  useArchiveBlock,
  useAddBlockReason,
  useCreateBlock,
  useDrivers,
  useInitiatives,
  useLinkBlockDrivers,
  useBlock,
  useBlockReasons,
  useDeleteBlockReason,
  useUnlinkBlockDriver,
  useUpdateBlock,
  useUpdateBlockReason,
} from "../lib/hooks";
import type { PeriodicEndMode, PeriodicSpec, PeriodicType } from "../lib/types";
import { DriverTypeBadge } from "../components/badges";
import { ReasonSection } from "../components/reason-section";
import { LoadingSpinner } from "../components/loading";
import { showToast } from "../components/toast";
import { formatDate, cn } from "../lib/utils";

type BlockKind = "one-time" | "recurring";

const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const pad = (n: number) => String(n).padStart(2, "0");

function toLocalDatetimeValue(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

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

function fromLocalDatetimeValue(val: string): string | null {
  if (!val) return null;
  return new Date(val).toISOString();
}

// ── Page shell ───────────────────────────────────────────────────────────────

export function BlockDetailPage() {
  const { blockId } = useParams<{ blockId: string }>();
  const isNew = !blockId;
  const { data: block, isLoading } = useBlock(blockId);

  if (!isNew && isLoading) {
    return (
      <div className="animate-fade-in">
        <Link to="/blocks" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Blocks
        </Link>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isNew && !block) {
    return (
      <div className="animate-fade-in">
        <Link to="/blocks" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Blocks
        </Link>
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-zinc-500">Block not found</p>
        </div>
      </div>
    );
  }

  return <BlockDetailForm key={blockId ?? "new"} blockId={blockId} isNew={isNew} />;
}

// ── Form component ───────────────────────────────────────────────────────────

function BlockDetailForm({ blockId, isNew }: { blockId?: string; isNew: boolean }) {
  const navigate = useNavigate();

  const { data: block } = useBlock(blockId);
  const { data: initiatives } = useInitiatives();
  const { data: drivers } = useDrivers();
  const { data: reasons = [], isLoading: reasonsLoading } = useBlockReasons(blockId);

  const createMutation = useCreateBlock();
  const updateMutation = useUpdateBlock();
  const archiveMutation = useArchiveBlock();
  const linkDriversMutation = useLinkBlockDrivers();
  const unlinkDriverMutation = useUnlinkBlockDriver();
  const addReasonMutation = useAddBlockReason();
  const updateReasonMutation = useUpdateBlockReason();
  const deleteReasonMutation = useDeleteBlockReason();

  const [title, setTitle] = useState(block?.title ?? "");
  const [description, setDescription] = useState(block?.description ?? "");
  const [initiativeId, setInitiativeId] = useState(block?.initiative_id ?? "");

  const [blockKind, setBlockKind] = useState<BlockKind>(
    block?.periodic_type ? "recurring" : "one-time",
  );

  // One-time: full datetime pickers
  const [startsAt, setStartsAt] = useState(toLocalDatetimeValue(block?.starts_at ?? null));
  const [endsAt, setEndsAt] = useState(toLocalDatetimeValue(block?.ends_at ?? null));

  // Recurring: decomposed into date + time-of-day window
  const [recurDate, setRecurDate] = useState(toDateValue(block?.starts_at ?? null));
  const [recurStartTime, setRecurStartTime] = useState(toTimeValue(block?.starts_at ?? null));
  const [recurEndTime, setRecurEndTime] = useState(toTimeValue(block?.ends_at ?? null));

  // Periodic config
  const [periodicType, setPeriodicType] = useState<PeriodicType>(block?.periodic_type ?? "weekly");
  const [periodicSpec, setPeriodicSpec] = useState<PeriodicSpec>(block?.periodic_spec ?? { days: [] });
  const [periodicEndMode, setPeriodicEndMode] = useState<PeriodicEndMode>(block?.periodic_end_mode ?? "never");
  const [periodicEndAt, setPeriodicEndAt] = useState(toDateValue(block?.periodic_end_at ?? null));
  const [periodicEndCount, setPeriodicEndCount] = useState<number | "">(block?.periodic_end_count ?? "");

  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>(block?.driver_ids ?? []);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  const isRecurring = blockKind === "recurring";

  const canSave = (() => {
    if (!title.trim()) return false;
    if (isRecurring) {
      return !!recurDate && !!recurStartTime && !!recurEndTime;
    }
    return !!startsAt && !!endsAt;
  })();

  async function handleSave() {
    if (!canSave) return;

    let computedStartsAt: string;
    let computedEndsAt: string;

    if (isRecurring) {
      computedStartsAt = composeDatetime(recurDate, recurStartTime)!;
      computedEndsAt = composeDatetime(recurDate, recurEndTime)!;
    } else {
      computedStartsAt = fromLocalDatetimeValue(startsAt)!;
      computedEndsAt = fromLocalDatetimeValue(endsAt)!;
    }

    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      starts_at: computedStartsAt,
      ends_at: computedEndsAt,
      initiative_id: initiativeId || null,
      periodic_type: isRecurring ? periodicType : null,
      periodic_spec: isRecurring ? periodicSpec : null,
      periodic_end_mode: isRecurring ? periodicEndMode : null,
      periodic_end_at: isRecurring && periodicEndMode === "until_date" && periodicEndAt
        ? new Date(periodicEndAt + "T23:59:59").toISOString()
        : null,
      periodic_end_count: isRecurring && periodicEndMode === "after_count"
        ? (periodicEndCount || null)
        : null,
    };

    try {
      if (isNew) {
        const created = await createMutation.mutateAsync({
          ...payload,
          driver_ids: selectedDriverIds.length > 0 ? selectedDriverIds : undefined,
        });
        showToast("success", "Block created");
        navigate(`/blocks/${created.id}`, { replace: true });
      } else if (blockId) {
        await updateMutation.mutateAsync({ id: blockId, data: payload });
        setDirty(false);
        showToast("success", "Changes saved");
      }
    } catch (err) {
      showToast("error", (err as Error).message || "Failed to save");
    }
  }

  function handleArchive() {
    if (!blockId) return;
    if (confirm("Archive this block?")) {
      archiveMutation.mutate(blockId, {
        onSuccess: () => {
          showToast("success", "Block archived");
          navigate("/blocks");
        },
        onError: (err) => showToast("error", err.message),
      });
    }
  }

  function handleLinkDriver(driverId: string) {
    if (!blockId) {
      setSelectedDriverIds((prev) => [...prev, driverId]);
      markDirty();
    } else {
      linkDriversMutation.mutate(
        { blockId, data: { driver_ids: [driverId] } },
        { onError: (err) => showToast("error", err.message) },
      );
    }
    setShowDriverPicker(false);
  }

  function handleUnlinkDriver(driverId: string) {
    if (!blockId) {
      setSelectedDriverIds((prev) => prev.filter((id) => id !== driverId));
      markDirty();
    } else {
      unlinkDriverMutation.mutate(
        { blockId, driverId },
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
    () => new Set(isNew ? selectedDriverIds : (block?.driver_ids ?? selectedDriverIds)),
    [isNew, selectedDriverIds, block?.driver_ids],
  );
  const availableDrivers = drivers?.filter(
    (driver) => !linkedDriverIds.has(driver.id) && !driver.deleted_at && driver.state !== "archived",
  );
  const linkedDrivers = drivers?.filter((driver) => linkedDriverIds.has(driver.id));

  return (
    <div className="animate-fade-in">
      <Link to="/blocks" className="btn-ghost mb-4 !px-0 text-zinc-500">
        <ArrowLeft className="h-4 w-4" />
        Back to Blocks
      </Link>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {/* Title */}
        <div className="px-6 pt-6">
          <input
            value={title}
            onChange={(e) => { setTitle(e.target.value); markDirty(); }}
            placeholder="Block title"
            className="w-full border-none bg-transparent text-xl font-semibold text-zinc-900 outline-none placeholder:text-zinc-300"
            autoFocus={isNew}
          />
        </div>

        {/* Kind toggle */}
        <div className="px-6 py-4">
          <div className="inline-flex rounded-lg border border-zinc-200 bg-zinc-50 p-0.5">
            <button
              type="button"
              onClick={() => { setBlockKind("one-time"); markDirty(); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all",
                blockKind === "one-time"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              )}
            >
              <CalendarClock className="h-3.5 w-3.5" />
              One-time
            </button>
            <button
              type="button"
              onClick={() => { setBlockKind("recurring"); markDirty(); }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3.5 py-1.5 text-sm font-medium transition-all",
                blockKind === "recurring"
                  ? "bg-white text-zinc-900 shadow-sm"
                  : "text-zinc-500 hover:text-zinc-700",
              )}
            >
              <Repeat className="h-3.5 w-3.5" />
              Recurring
            </button>
          </div>
        </div>

        {/* ── One-time scheduling ────────────────────────────────────────── */}
        {blockKind === "one-time" && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <div className="flex flex-wrap gap-4">
              <div>
                <label className="label">Starts at</label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => { setStartsAt(e.target.value); markDirty(); }}
                  className="input w-auto text-sm"
                />
              </div>
              <div>
                <label className="label">Ends at</label>
                <input
                  type="datetime-local"
                  value={endsAt}
                  onChange={(e) => { setEndsAt(e.target.value); markDirty(); }}
                  className="input w-auto text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* ── Recurring scheduling ───────────────────────────────────────── */}
        {blockKind === "recurring" && (
          <div className="border-t border-zinc-100 px-6 py-4 space-y-5">
            {/* Frequency + pattern */}
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
                <input
                  type="time"
                  value={recurStartTime}
                  onChange={(e) => { setRecurStartTime(e.target.value); markDirty(); }}
                  className="input w-auto text-sm"
                />
                <span className="text-sm text-zinc-400">to</span>
                <input
                  type="time"
                  value={recurEndTime}
                  onChange={(e) => { setRecurEndTime(e.target.value); markDirty(); }}
                  className="input w-auto text-sm"
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

        {/* Initiative */}
        <div className="border-t border-zinc-100 px-6 py-4">
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
        {!isNew && blockId && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <ReasonSection
              reasons={reasons}
              isLoading={reasonsLoading}
              onAdd={(text) => addReasonMutation.mutate({ blockId, data: { reason_text: text } })}
              onUpdate={(reasonId, text) =>
                updateReasonMutation.mutate({ reasonId, blockId, data: { reason_text: text } })
              }
              onDelete={(reasonId) => deleteReasonMutation.mutate({ reasonId, blockId })}
              isAdding={addReasonMutation.isPending}
            />
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/80 px-6 py-4">
          <div className="text-xs text-zinc-400">
            {block && (
              <>
                Created {formatDate(block.created_at)} &middot; Updated{" "}
                {formatDate(block.updated_at)} &middot; v{block.version}
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
              {isNew ? "Create Block" : "Save Changes"}
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
