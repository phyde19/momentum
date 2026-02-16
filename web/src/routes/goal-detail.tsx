import { useState } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { ArrowLeft, Save, Archive, Star } from "lucide-react";
import {
  useGoal,
  useCreateGoal,
  useUpdateGoal,
  useArchiveGoal,
  useGoals,
  useGoalReasons,
  useAddGoalReason,
  useUpdateGoalReason,
  useDeleteGoalReason,
} from "../lib/hooks";
import type { GoalType, GoalState } from "../lib/types";
import { ReasonSection } from "../components/reason-section";
import { LoadingSpinner } from "../components/loading";
import { showToast } from "../components/toast";
import { formatDate, cn } from "../lib/utils";

const GOAL_TYPE_OPTIONS: { value: GoalType; label: string; desc: string }[] = [
  { value: "path", label: "Path", desc: "Open-ended pursuit or large-scale objective" },
  { value: "vehicle", label: "Vehicle", desc: "Systems and routines that sustain your foundation" },
  { value: "general", label: "General", desc: "Uncategorized goal" },
];

const GOAL_STATE_OPTIONS: { value: GoalState; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "abandoned", label: "Abandoned" },
];

// ── Page shell: loading gate + key-based reset ──────────────────────────────

export function GoalDetailPage() {
  const { goalId } = useParams<{ goalId: string }>();
  const isNew = !goalId;
  const { data: goal, isLoading } = useGoal(goalId);

  if (!isNew && isLoading) {
    return (
      <div className="animate-fade-in">
        <Link to="/goals" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Goals
        </Link>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isNew && !goal) {
    return (
      <div className="animate-fade-in">
        <Link to="/goals" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Goals
        </Link>
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-zinc-500">Goal not found</p>
        </div>
      </div>
    );
  }

  return <GoalDetailForm key={goalId ?? "new"} goalId={goalId} isNew={isNew} />;
}

// ── Form component: local state initialized once, no useEffect sync ─────────

function GoalDetailForm({ goalId, isNew }: { goalId?: string; isNew: boolean }) {
  const navigate = useNavigate();

  // Live query — for read-only metadata (version, timestamps)
  const { data: goal } = useGoal(goalId);
  const { data: allGoals } = useGoals();
  const { data: reasons = [], isLoading: reasonsLoading } = useGoalReasons(goalId);

  // Mutations
  const createMutation = useCreateGoal();
  const updateMutation = useUpdateGoal();
  const archiveMutation = useArchiveGoal();
  const addReasonMutation = useAddGoalReason();
  const updateReasonMutation = useUpdateGoalReason();
  const deleteReasonMutation = useDeleteGoalReason();

  // ── Form state: initialized once from goal data, never auto-synced ────
  const [title, setTitle] = useState(goal?.title ?? "");
  const [description, setDescription] = useState(goal?.description ?? "");
  const [goalType, setGoalType] = useState<GoalType>(goal?.goal_type ?? "path");
  const [state, setState] = useState<GoalState>(goal?.state ?? "active");
  const [parentGoalId, setParentGoalId] = useState<string>(goal?.parent_goal_id ?? "");
  const [dirty, setDirty] = useState(false);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  // Available parent goals (exclude self, archived)
  const parentOptions = allGoals?.filter(
    (g) => g.id !== goalId && !g.deleted_at && g.state !== "archived",
  );

  async function handleSave() {
    if (!title.trim()) return;

    try {
      if (isNew) {
        const created = await createMutation.mutateAsync({
          title: title.trim(),
          description: description.trim() || undefined,
          goal_type: goalType,
          state,
          parent_goal_id: parentGoalId || undefined,
        });
        showToast("success", "Goal created");
        navigate(`/goals/${created.id}`, { replace: true });
      } else if (goalId) {
        await updateMutation.mutateAsync({
          id: goalId,
          data: {
            title: title.trim(),
            description: description.trim() || null,
            goal_type: goalType,
            state,
            parent_goal_id: parentGoalId || null,
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
    if (!goalId) return;
    if (confirm("Archive this goal? Active tasks must be unlinked first.")) {
      archiveMutation.mutate(goalId, {
        onSuccess: () => {
          showToast("success", "Goal archived");
          navigate("/goals");
        },
        onError: (err) => showToast("error", err.message),
      });
    }
  }

  return (
    <div className="animate-fade-in">
      {/* Back link */}
      <Link to="/goals" className="btn-ghost mb-4 !px-0 text-zinc-500">
        <ArrowLeft className="h-4 w-4" />
        Back to Goals
      </Link>

      {/* Main card */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {/* Title */}
        <div className="px-6 pt-6">
          <div className="flex items-center gap-3">
            <input
              value={title}
              onChange={(e) => {
                setTitle(e.target.value);
                markDirty();
              }}
              placeholder="Goal title"
              className="w-full border-none bg-transparent text-xl font-semibold text-zinc-900 outline-none placeholder:text-zinc-300"
              autoFocus={isNew}
              disabled={goal?.is_default}
            />
            {goal?.is_default && (
              <span className="flex shrink-0 items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                <Star className="h-3 w-3 fill-current" />
                Default
              </span>
            )}
          </div>
        </div>

        {/* Type selector - visual cards */}
        <div className="px-6 py-4">
          <label className="label">Type</label>
          <div className="grid grid-cols-3 gap-3">
            {GOAL_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => {
                  setGoalType(opt.value);
                  markDirty();
                }}
                disabled={goal?.is_default}
                className={cn(
                  "rounded-lg border p-3 text-left transition-all duration-150",
                  goalType === opt.value
                    ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                  goal?.is_default && "cursor-not-allowed opacity-50",
                )}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={cn(
                      "h-2.5 w-2.5 rounded-full",
                      opt.value === "path" && "bg-violet-500",
                      opt.value === "vehicle" && "bg-emerald-500",
                      opt.value === "general" && "bg-zinc-400",
                    )}
                  />
                  <span className="text-sm font-medium text-zinc-900">{opt.label}</span>
                </div>
                <p className="mt-1 text-xs text-zinc-500">{opt.desc}</p>
              </button>
            ))}
          </div>
        </div>

        {/* State + parent row */}
        <div className="flex flex-wrap gap-4 px-6 pb-4">
          <div>
            <label className="label">State</label>
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value as GoalState);
                markDirty();
              }}
              className="select w-auto text-sm"
              disabled={goal?.is_default}
            >
              {GOAL_STATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">Parent Goal</label>
            <select
              value={parentGoalId}
              onChange={(e) => {
                setParentGoalId(e.target.value);
                markDirty();
              }}
              className="select w-auto min-w-[200px] text-sm"
            >
              <option value="">None</option>
              {parentOptions?.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.title}
                </option>
              ))}
            </select>
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
            placeholder="Describe this goal..."
            rows={4}
            className="input min-h-[100px] resize-y text-sm"
          />
        </div>

        {/* Reasons (only for existing goals) */}
        {!isNew && goalId && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <ReasonSection
              reasons={reasons}
              isLoading={reasonsLoading}
              onAdd={(text) =>
                addReasonMutation.mutate({ goalId, data: { reason_text: text } })
              }
              onUpdate={(reasonId, text) =>
                updateReasonMutation.mutate({
                  reasonId,
                  goalId,
                  data: { reason_text: text },
                })
              }
              onDelete={(reasonId) =>
                deleteReasonMutation.mutate({ reasonId, goalId })
              }
              isAdding={addReasonMutation.isPending}
            />
          </div>
        )}

        {/* Footer — metadata reads from live query, always fresh */}
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/80 px-6 py-4">
          <div className="text-xs text-zinc-400">
            {goal && (
              <>
                Created {formatDate(goal.created_at)} &middot; Updated{" "}
                {formatDate(goal.updated_at)} &middot; v{goal.version}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && !goal?.is_default && (
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
              {isNew ? "Create Goal" : "Save Changes"}
            </button>
          </div>
        </div>

        {/* Error display */}
        {(createMutation.error || updateMutation.error || archiveMutation.error) && (
          <div className="border-t border-red-200 bg-red-50 px-6 py-3 text-sm text-red-700">
            {(createMutation.error as Error)?.message ||
              (updateMutation.error as Error)?.message ||
              (archiveMutation.error as Error)?.message}
          </div>
        )}
      </div>
    </div>
  );
}
