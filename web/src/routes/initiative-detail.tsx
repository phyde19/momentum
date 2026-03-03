import { useMemo, useState } from "react";
import { useNavigate, useParams, Link } from "react-router";
import { ArrowLeft, Archive, Link2, Plus, Save, X } from "lucide-react";
import {
  useAddInitiativeReason,
  useArchiveInitiative,
  useCreateInitiative,
  useDeleteInitiativeReason,
  useDrivers,
  useInitiative,
  useInitiativeReasons,
  useLinkInitiativeDrivers,
  useTasks,
  useUnlinkInitiativeDriver,
  useUpdateInitiative,
  useUpdateInitiativeReason,
} from "../lib/hooks";
import type { InitiativeState } from "../lib/types";
import { DriverTypeBadge, InitiativeStateBadge } from "../components/badges";
import { ReasonSection } from "../components/reason-section";
import { LoadingSpinner } from "../components/loading";
import { showToast } from "../components/toast";
import { cn, formatDate, fromDateInputValue, toDateInputValue } from "../lib/utils";

const INITIATIVE_STATE_OPTIONS: { value: InitiativeState; label: string }[] = [
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "abandoned", label: "Abandoned" },
];

export function InitiativeDetailPage() {
  const { initiativeId } = useParams<{ initiativeId: string }>();
  const isNew = !initiativeId;
  const { data: initiative, isLoading } = useInitiative(initiativeId);

  if (!isNew && isLoading) {
    return (
      <div className="animate-fade-in">
        <Link to="/initiatives" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Initiatives
        </Link>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isNew && !initiative) {
    return (
      <div className="animate-fade-in">
        <Link to="/initiatives" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Initiatives
        </Link>
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-zinc-500">Initiative not found</p>
        </div>
      </div>
    );
  }

  return <InitiativeDetailForm key={initiativeId ?? "new"} initiativeId={initiativeId} isNew={isNew} />;
}

function InitiativeDetailForm({
  initiativeId,
  isNew,
}: {
  initiativeId?: string;
  isNew: boolean;
}) {
  const navigate = useNavigate();

  const { data: initiative } = useInitiative(initiativeId);
  const { data: drivers } = useDrivers();
  const { data: childTasks } = useTasks({ initiative_id: initiativeId });
  const { data: reasons = [], isLoading: reasonsLoading } = useInitiativeReasons(initiativeId);

  const createMutation = useCreateInitiative();
  const updateMutation = useUpdateInitiative();
  const archiveMutation = useArchiveInitiative();
  const linkDriversMutation = useLinkInitiativeDrivers();
  const unlinkDriverMutation = useUnlinkInitiativeDriver();
  const addReasonMutation = useAddInitiativeReason();
  const updateReasonMutation = useUpdateInitiativeReason();
  const deleteReasonMutation = useDeleteInitiativeReason();

  const [title, setTitle] = useState(initiative?.title ?? "");
  const [description, setDescription] = useState(initiative?.description ?? "");
  const [state, setState] = useState<InitiativeState>(initiative?.state ?? "active");
  const [dueStartAt, setDueStartAt] = useState(toDateInputValue(initiative?.due_start_at));
  const [dueEndAt, setDueEndAt] = useState(toDateInputValue(initiative?.due_end_at));
  const [selectedDriverIds, setSelectedDriverIds] = useState<string[]>(initiative?.driver_ids ?? []);
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
          state,
          due_start_at: fromDateInputValue(dueStartAt),
          due_end_at: fromDateInputValue(dueEndAt),
          driver_ids: selectedDriverIds,
        });
        showToast("success", "Initiative created");
        navigate(`/initiatives/${created.id}`, { replace: true });
      } else if (initiativeId) {
        await updateMutation.mutateAsync({
          id: initiativeId,
          data: {
            title: title.trim(),
            description: description.trim() || null,
            state,
            due_start_at: fromDateInputValue(dueStartAt),
            due_end_at: fromDateInputValue(dueEndAt),
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
    if (!initiativeId) return;
    if (confirm("Archive this initiative? Active tasks must be unlinked first.")) {
      archiveMutation.mutate(initiativeId, {
        onSuccess: () => {
          showToast("success", "Initiative archived");
          navigate("/initiatives");
        },
        onError: (err) => showToast("error", err.message),
      });
    }
  }

  function handleLinkDriver(driverId: string) {
    if (!initiativeId) {
      setSelectedDriverIds((prev) => [...prev, driverId]);
      markDirty();
    } else {
      linkDriversMutation.mutate(
        { initiativeId, data: { driver_ids: [driverId] } },
        { onError: (err) => showToast("error", err.message) },
      );
    }
    setShowDriverPicker(false);
  }

  function handleUnlinkDriver(driverId: string) {
    if (!initiativeId) {
      setSelectedDriverIds((prev) => prev.filter((id) => id !== driverId));
      markDirty();
    } else {
      unlinkDriverMutation.mutate(
        { initiativeId, driverId },
        { onError: (err) => showToast("error", err.message) },
      );
    }
  }

  const linkedDriverIds = useMemo(
    () => new Set(isNew ? selectedDriverIds : (initiative?.driver_ids ?? selectedDriverIds)),
    [isNew, selectedDriverIds, initiative?.driver_ids],
  );
  const availableDrivers = drivers?.filter(
    (driver) => !linkedDriverIds.has(driver.id) && !driver.deleted_at && driver.state !== "archived",
  );
  const linkedDrivers = drivers?.filter((driver) => linkedDriverIds.has(driver.id));

  return (
    <div className="animate-fade-in">
      <Link to="/initiatives" className="btn-ghost mb-4 !px-0 text-zinc-500">
        <ArrowLeft className="h-4 w-4" />
        Back to Initiatives
      </Link>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        <div className="px-6 pt-6">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
            placeholder="Initiative title"
            className="w-full border-none bg-transparent text-xl font-semibold text-zinc-900 outline-none placeholder:text-zinc-300"
            autoFocus={isNew}
          />
        </div>

        <div className="flex flex-wrap gap-4 px-6 py-4">
          <div>
            <label className="label">State</label>
            <select
              value={state}
              onChange={(e) => {
                setState(e.target.value as InitiativeState);
                markDirty();
              }}
              className="select w-auto text-sm"
            >
              {INITIATIVE_STATE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
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
        </div>

        <div className="border-t border-zinc-100 px-6 pb-4 pt-4">
          <label className="label">Description</label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              markDirty();
            }}
            placeholder="Describe this initiative..."
            rows={4}
            className="input min-h-[100px] resize-y text-sm"
          />
        </div>

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

        {!isNew && initiativeId && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="text-sm font-medium text-zinc-700">Task Children</h3>
              <Link to={`/tasks/new?initiativeId=${initiativeId}`} className="btn-ghost !px-2 !py-1 text-xs">
                <Plus className="h-3.5 w-3.5" />
                New Task Child
              </Link>
            </div>
            <div className="space-y-1">
              {childTasks?.length ? (
                childTasks.map((task) => (
                  <Link
                    key={task.id}
                    to={`/tasks/${task.id}`}
                    className={cn(
                      "block rounded-md border border-zinc-100 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-50",
                      task.status === "done" && "text-zinc-400 line-through",
                    )}
                  >
                    {task.title}
                  </Link>
                ))
              ) : (
                <p className="text-xs italic text-zinc-400">No task children linked yet.</p>
              )}
            </div>
          </div>
        )}

        {!isNew && initiativeId && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <ReasonSection
              reasons={reasons}
              isLoading={reasonsLoading}
              onAdd={(text) => addReasonMutation.mutate({ initiativeId, data: { reason_text: text } })}
              onUpdate={(reasonId, text) =>
                updateReasonMutation.mutate({ reasonId, initiativeId, data: { reason_text: text } })
              }
              onDelete={(reasonId) => deleteReasonMutation.mutate({ reasonId, initiativeId })}
              isAdding={addReasonMutation.isPending}
            />
          </div>
        )}

        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/80 px-6 py-4">
          <div className="text-xs text-zinc-400">
            {initiative && (
              <>
                <InitiativeStateBadge state={initiative.state} /> {"  "}
                Updated {formatDate(initiative.updated_at)} &middot; v{initiative.version}
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
              {isNew ? "Create Initiative" : "Save Changes"}
            </button>
          </div>
        </div>

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

