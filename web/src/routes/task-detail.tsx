import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router";
import {
  ArrowLeft,
  Save,
  Archive,
  Link2,
  Plus,
  X,
} from "lucide-react";
import {
  useTask,
  useCreateTask,
  useUpdateTask,
  useArchiveTask,
  useGoals,
  useTaskReasons,
  useAddTaskReason,
  useUpdateTaskReason,
  useDeleteTaskReason,
  useLinkTaskGoals,
  useUnlinkTaskGoal,
} from "../lib/hooks";
import type { TaskStatus, TaskPriority, Task } from "../lib/types";
import { GoalTypeBadge } from "../components/badges";
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

  // Live query — used only for read-only metadata (version, timestamps)
  // and for linked-goal display (which changes via link/unlink mutations).
  const { data: task } = useTask(taskId);
  const { data: goals } = useGoals();
  const { data: reasons = [], isLoading: reasonsLoading } = useTaskReasons(taskId);

  // Mutations
  const createMutation = useCreateTask();
  const updateMutation = useUpdateTask();
  const archiveMutation = useArchiveTask();
  const linkGoalsMutation = useLinkTaskGoals();
  const unlinkGoalMutation = useUnlinkTaskGoal();
  const addReasonMutation = useAddTaskReason();
  const updateReasonMutation = useUpdateTaskReason();
  const deleteReasonMutation = useDeleteTaskReason();

  // ── Form state: initialized once from task data, never auto-synced ────
  const [title, setTitle] = useState(task?.title ?? "");
  const [description, setDescription] = useState(task?.description ?? "");
  const [status, setStatus] = useState<TaskStatus>(task?.status ?? "todo");
  const [priority, setPriority] = useState<TaskPriority>(task?.priority ?? "medium");
  const [dueAt, setDueAt] = useState(toDateInputValue(task?.due_at));
  const [selectedGoalIds, setSelectedGoalIds] = useState<string[]>(task?.goal_ids ?? []);
  const [showGoalPicker, setShowGoalPicker] = useState(false);
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
          due_at: fromDateInputValue(dueAt),
          goal_ids: selectedGoalIds.length > 0 ? selectedGoalIds : undefined,
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
            due_at: fromDateInputValue(dueAt),
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

  function handleLinkGoal(goalId: string) {
    if (!taskId) {
      setSelectedGoalIds((prev) => [...prev, goalId]);
      markDirty();
    } else {
      linkGoalsMutation.mutate(
        { taskId, data: { goal_ids: [goalId] } },
        { onError: (err) => showToast("error", err.message) },
      );
    }
    setShowGoalPicker(false);
  }

  function handleUnlinkGoal(goalId: string) {
    if (!taskId) {
      setSelectedGoalIds((prev) => prev.filter((id) => id !== goalId));
      markDirty();
    } else {
      unlinkGoalMutation.mutate(
        { taskId, goalId },
        { onError: (err) => showToast("error", err.message) },
      );
    }
  }

  // For existing tasks, linked goals come from the live query (auto-updates
  // after link/unlink mutations). For new tasks, from local state.
  const linkedGoalIds = useMemo(
    () => new Set(isNew ? selectedGoalIds : (task?.goal_ids ?? selectedGoalIds)),
    [isNew, selectedGoalIds, task?.goal_ids],
  );
  const availableGoals = goals?.filter(
    (g) => !linkedGoalIds.has(g.id) && !g.deleted_at && g.state !== "archived",
  );
  const linkedGoals = goals?.filter((g) => linkedGoalIds.has(g.id));

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

        {/* Status / Priority / Due date row */}
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
            <label className="label">Due date</label>
            <input
              type="date"
              value={dueAt}
              onChange={(e) => {
                setDueAt(e.target.value);
                markDirty();
              }}
              className="input w-auto text-sm"
            />
          </div>
        </div>

        {/* Description */}
        <div className="px-6 pb-4">
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

        {/* Linked Goals */}
        <div className="border-t border-zinc-100 px-6 py-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-zinc-400" />
              <h3 className="text-sm font-medium text-zinc-700">Linked Goals</h3>
            </div>
            {!showGoalPicker && (
              <button
                onClick={() => setShowGoalPicker(true)}
                className="btn-ghost !px-2 !py-1 text-xs"
              >
                <Plus className="h-3.5 w-3.5" />
                Link
              </button>
            )}
          </div>

          <div className="flex flex-wrap gap-2">
            {linkedGoals?.map((goal) => (
              <div
                key={goal.id}
                className="group flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-2.5 py-1.5"
              >
                <GoalTypeBadge type={goal.goal_type} />
                <span className="text-sm text-zinc-700">{goal.title}</span>
                {linkedGoalIds.size > 1 && (
                  <button
                    onClick={() => handleUnlinkGoal(goal.id)}
                    className="ml-1 rounded p-0.5 text-zinc-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                  >
                    <X className="h-3 w-3" />
                  </button>
                )}
              </div>
            ))}

            {linkedGoals?.length === 0 && !showGoalPicker && (
              <p className="text-xs italic text-zinc-400">No goals linked</p>
            )}
          </div>

          {showGoalPicker && (
            <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
              <p className="mb-2 text-xs font-medium text-zinc-500">Select a goal to link:</p>
              <div className="max-h-48 space-y-1 overflow-y-auto">
                {availableGoals?.map((goal) => (
                  <button
                    key={goal.id}
                    onClick={() => handleLinkGoal(goal.id)}
                    className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white"
                  >
                    <GoalTypeBadge type={goal.goal_type} />
                    <span className="text-zinc-700">{goal.title}</span>
                  </button>
                ))}
                {availableGoals?.length === 0 && (
                  <p className="text-xs text-zinc-400">No more goals to link</p>
                )}
              </div>
              <button
                onClick={() => setShowGoalPicker(false)}
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
