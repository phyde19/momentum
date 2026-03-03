import { useState, useMemo } from "react";
import { useParams, useNavigate, Link, useSearchParams } from "react-router";
import {
  ArrowLeft,
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
import type { ChecklistItem, TaskPriority, TaskRecurrence, TaskStatus } from "../lib/types";
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

const RECURRENCE_OPTIONS: { value: TaskRecurrence | ""; label: string }[] = [
  { value: "", label: "No recurrence" },
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
  { value: "custom", label: "Custom rule" },
];

// ── Page shell: loading gate + key-based reset ──────────────────────────────

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

  // key={taskId} ensures React discards & remounts the form when
  // navigating between tasks, giving us fresh useState initializers.
  return <TaskDetailForm key={taskId ?? "new"} taskId={taskId} isNew={isNew} />;
}

// ── Form component: local state initialized once, no useEffect sync ─────────

function TaskDetailForm({ taskId, isNew }: { taskId?: string; isNew: boolean }) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  // Live query — used only for read-only metadata (version, timestamps)
  // and for linked-driver display (which changes via link/unlink mutations).
  const { data: task } = useTask(taskId);
  const { data: initiatives } = useInitiatives();
  const { data: drivers } = useDrivers();
  const { data: reasons = [], isLoading: reasonsLoading } = useTaskReasons(taskId);

  // Mutations
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const archiveMutation = useArchiveTask();
  const linkDriversMutation = useLinkTaskDrivers();
  const unlinkDriverMutation = useUnlinkTaskDriver();
  const addReasonMutation = useAddTaskReason();
  const updateReasonMutation = useUpdateTaskReason();
  const deleteReasonMutation = useDeleteTaskReason();

  // ── Form state: initialized once from task data, never auto-synced ────
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [initiativeId, setInitiativeId] = useState(
    task?.initiative_id ?? (isNew ? (searchParams.get("initiativeId") ?? "") : ""),
  );
  const [dueStartAt, setDueStartAt] = useState(toDateInputValue(task?.due_start_at));
  const [dueEndAt, setDueEndAt] = useState(toDateInputValue(task?.due_end_at));
  const [recurrence, setRecurrence] = useState<TaskRecurrence | "">(task?.recurrence ?? "");
  const [recurrenceInterval, setRecurrenceInterval] = useState(
    task?.recurrence_interval ? String(task.recurrence_interval) : "",
  );
  const [recurrenceRule, setRecurrenceRule] = useState(task?.recurrence_rule ?? "");
  const [recurrenceUntil, setRecurrenceUntil] = useState(toDateInputValue(task?.recurrence_until));
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task?.checklist_json ?? []);
  const [newChecklistItem, setNewChecklistItem] = useState("");
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>(task?.driver_ids ?? []);
  const [showDriverPicker, setShowDriverPicker] = useState(false);
  const [dirty, setDirty] = useState(false);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  async function handleSave() {
    if (!title.trim()) return;

    try {
      if (isNew) {
        const created = await createMutation.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          status,
          priority,
          initiative_id: initiativeId || null,
          due_start_at: fromDateInputValue(dueStartAt),
          due_end_at: fromDateInputValue(dueEndAt),
          recurrence: recurrence || null,
          recurrence_interval: recurrence ? Number(recurrenceInterval || "1") : null,
          recurrence_rule: recurrenceRule.trim() || null,
          recurrence_until: recurrence ? fromDateInputValue(recurrenceUntil) : null,
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
            due_start_at: fromDateInputValue(dueStartAt),
            due_end_at: fromDateInputValue(dueEndAt),
            recurrence: recurrence || null,
            recurrence_interval: recurrence ? Number(recurrenceInterval || "1") : null,
            recurrence_rule: recurrenceRule.trim() || null,
            recurrence_until: recurrence ? fromDateInputValue(recurrenceUntil) : null,
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
    const title = newChecklistItem.trim();
    if (!title) return;
    setChecklist((prev) => [...prev, { title, is_done: false }]);
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

  // For existing tasks, linked drivers come from the live query (auto-updates
  // after link/unlink mutations). For new tasks, from local state.
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
      {/* Back link */}
      <Link to="/tasks" className="btn-ghost mb-4 !px-0 text-zinc-500">
        <ArrowLeft className="h-4 w-4" />
        Back to Tasks
      </Link>

      {/* Main card */}
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

        {/* Status / Priority / Initiative row */}
        <div className="flex flex-wrap gap-4 px-6 py-4">
          <div>
            <label className="label">Status</label>
            <select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value as TaskStatus);
                markDirty();
              }}
              className="select w-auto text-sm"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Priority</label>
            <select
              value={priority}
              onChange={(e) => {
                setPriority(e.target.value as TaskPriority);
                markDirty();
              }}
              className="select w-auto text-sm"
            >
              {PRIORITY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Initiative</label>
            <select
              value={initiativeId}
              onChange={(e) => {
                setInitiativeId(e.target.value);
                markDirty();
              }}
              className="select w-auto min-w-[220px] text-sm"
            >
              <option value="">None</option>
              {initiatives
                ?.filter((initiative) => !initiative.deleted_at && initiative.state !== "archived")
                .map((initiative) => (
                  <option key={initiative.id} value={initiative.id}>
                    {initiative.title}
                  </option>
                ))}
            </select>
          </div>
        </div>

        {/* Schedule */}
        <div className="border-t border-zinc-100 px-6 py-4">
          <h3 className="mb-3 text-sm font-medium text-zinc-700">Schedule</h3>
          <div className="flex flex-wrap gap-4">
            <div>
              <label className="label">Due start</label>
              <input
                type="date"
                value={dueStartAt}
                onChange={(e) => {
                  setDueStartAt(e.target.value);
                  markDirty();
                }}
                className="input w-auto text-sm"
              />
            </div>
            <div>
              <label className="label">Due end</label>
              <input
                type="date"
                value={dueEndAt}
                onChange={(e) => {
                  setDueEndAt(e.target.value);
                  markDirty();
                }}
                className="input w-auto text-sm"
              />
            </div>
            <div>
              <label className="label">Recurrence</label>
              <select
                value={recurrence}
                onChange={(e) => {
                  setRecurrence(e.target.value as TaskRecurrence | "");
                  if (!e.target.value) {
                    setRecurrenceInterval("");
                    setRecurrenceRule("");
                    setRecurrenceUntil("");
                  }
                  markDirty();
                }}
                className="select w-auto min-w-[170px] text-sm"
              >
                {RECURRENCE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            {recurrence && (
              <>
                <div>
                  <label className="label">Interval</label>
                  <input
                    type="number"
                    min={1}
                    value={recurrenceInterval}
                    onChange={(e) => {
                      setRecurrenceInterval(e.target.value);
                      markDirty();
                    }}
                    className="input w-24 text-sm"
                  />
                </div>
                <div>
                  <label className="label">Until</label>
                  <input
                    type="date"
                    value={recurrenceUntil}
                    onChange={(e) => {
                      setRecurrenceUntil(e.target.value);
                      markDirty();
                    }}
                    className="input w-auto text-sm"
                  />
                </div>
                <div className="min-w-[220px]">
                  <label className="label">Custom rule (optional)</label>
                  <input
                    type="text"
                    value={recurrenceRule}
                    onChange={(e) => {
                      setRecurrenceRule(e.target.value);
                      markDirty();
                    }}
                    className="input text-sm"
                    placeholder="Optional custom pattern"
                  />
                </div>
              </>
            )}
          </div>
        </div>

        {/* Description */}
        <div className="border-t border-zinc-100 px-6 pb-4 pt-4">
          <label className="label">Description</label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              markDirty();
            }}
            placeholder="Add a description..."
            rows={4}
            className="input min-h-[100px] resize-y text-sm"
          />
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
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addChecklistItem();
                  }
                }}
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
              <button
                onClick={() => setShowDriverPicker(true)}
                className="btn-ghost !px-2 !py-1 text-xs"
              >
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
              <button
                onClick={() => setShowDriverPicker(false)}
                className="btn-ghost mt-2 w-full text-xs"
              >
                Cancel
              </button>
            </div>
          )}
        </div>

        {/* Reasons (only for existing tasks) */}
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
          {/* Metadata reads from live query — always fresh after mutations */}
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

        {/* Error display */}
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
