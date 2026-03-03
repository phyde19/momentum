import { useState, useMemo } from "react";
import { useParams, useNavigate, Link } from "react-router";
import { ArrowLeft, Save, Archive, Plus, X, ChevronRight } from "lucide-react";
import {
  useArchiveDriver,
  useCreateDriver,
  useDriver,
  useDrivers,
  useUpdateDriver,
} from "../lib/hooks";
import type { DriverType } from "../lib/types";
import { DriverTypeBadge } from "../components/badges";
import { LoadingSpinner } from "../components/loading";
import { showToast } from "../components/toast";
import { formatDate, cn } from "../lib/utils";

const DRIVER_TYPE_OPTIONS: { value: DriverType; label: string; hint: string }[] = [
  { value: "obligation", label: "Obligation", hint: "Commitments — family, friends, promises" },
  { value: "risk", label: "Risk", hint: "Finance, health, career — failure is catastrophic" },
  { value: "leverage", label: "Leverage", hint: "Capital & resource accumulation — stability and control" },
  { value: "surplus", label: "Surplus", hint: "Giving back, connection, making things better" },
];

export function DriverDetailPage() {
  const { driverId } = useParams<{ driverId: string }>();
  const isNew = !driverId;
  const { data: driver, isLoading } = useDriver(driverId);

  if (!isNew && isLoading) {
    return (
      <div className="animate-fade-in">
        <Link to="/drivers" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Drivers
        </Link>
        <LoadingSpinner />
      </div>
    );
  }

  if (!isNew && !driver) {
    return (
      <div className="animate-fade-in">
        <Link to="/drivers" className="btn-ghost mb-4 !px-0 text-zinc-500">
          <ArrowLeft className="h-4 w-4" />
          Back to Drivers
        </Link>
        <div className="rounded-xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
          <p className="text-sm text-zinc-500">Driver not found</p>
        </div>
      </div>
    );
  }

  return <DriverDetailForm key={driverId ?? "new"} driverId={driverId} isNew={isNew} />;
}

function DriverDetailForm({ driverId, isNew }: { driverId?: string; isNew: boolean }) {
  const navigate = useNavigate();

  const { data: driver } = useDriver(driverId);
  const { data: allDrivers } = useDrivers();

  const createMutation = useCreateDriver();
  const updateMutation = useUpdateDriver();
  const archiveMutation = useArchiveDriver();

  const [title, setTitle] = useState(driver?.title ?? "");
  const [description, setDescription] = useState(driver?.description ?? "");
  const [driverType, setDriverType] = useState<DriverType>(driver?.driver_type ?? "obligation");
  const [parentDriverId, setParentDriverId] = useState(driver?.parent_driver_id ?? "");
  const [dirty, setDirty] = useState(false);
  const [showParentPicker, setShowParentPicker] = useState(false);
  const [showChildPicker, setShowChildPicker] = useState(false);

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function markDirty() {
    if (!dirty) setDirty(true);
  }

  const isChildDriver = !!parentDriverId;
  const currentParent = allDrivers?.find((d) => d.id === parentDriverId);

  const childDrivers = useMemo(
    () =>
      (allDrivers ?? []).filter(
        (d) => d.parent_driver_id === driverId && !d.deleted_at,
      ),
    [allDrivers, driverId],
  );

  const hasChildren = childDrivers.length > 0;

  const availableParents = useMemo(
    () =>
      (allDrivers ?? []).filter(
        (d) =>
          !d.parent_driver_id &&
          !d.deleted_at &&
          d.state !== "archived" &&
          d.id !== driverId,
      ),
    [allDrivers, driverId],
  );

  const availableChildCandidates = useMemo(
    () =>
      (allDrivers ?? []).filter(
        (d) =>
          !d.parent_driver_id &&
          !d.deleted_at &&
          d.state !== "archived" &&
          d.id !== driverId,
      ),
    [allDrivers, driverId],
  );

  async function handleSave() {
    if (!title.trim()) return;

    try {
      if (isNew) {
        const created = await createMutation.mutateAsync({
          title: title.trim(),
          description: description.trim() || null,
          driver_type: driverType,
          parent_driver_id: parentDriverId || null,
        });
        showToast("success", "Driver created");
        navigate(`/drivers/${created.id}`, { replace: true });
      } else if (driverId) {
        await updateMutation.mutateAsync({
          id: driverId,
          data: {
            title: title.trim(),
            description: description.trim() || null,
            driver_type: driverType,
            parent_driver_id: parentDriverId || null,
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
    if (!driverId) return;
    if (confirm("Archive this driver? Child drivers and active links must be cleared first.")) {
      archiveMutation.mutate(driverId, {
        onSuccess: () => {
          showToast("success", "Driver archived");
          navigate("/drivers");
        },
        onError: (err) => showToast("error", err.message),
      });
    }
  }

  function handleSetParent(parentId: string) {
    setParentDriverId(parentId);
    setShowParentPicker(false);
    markDirty();
  }

  function handleRemoveParent() {
    setParentDriverId("");
    markDirty();
  }

  async function handleAdoptChild(childId: string) {
    if (!driverId) return;
    try {
      await updateMutation.mutateAsync({
        id: childId,
        data: { parent_driver_id: driverId },
      });
      showToast("success", "Child driver linked");
    } catch (err) {
      showToast("error", (err as Error).message || "Failed to link child");
    }
    setShowChildPicker(false);
  }

  async function handleRemoveChild(childId: string) {
    try {
      await updateMutation.mutateAsync({
        id: childId,
        data: { parent_driver_id: null },
      });
      showToast("success", "Child driver unlinked");
    } catch (err) {
      showToast("error", (err as Error).message || "Failed to unlink child");
    }
  }

  const selectedTypeOption = DRIVER_TYPE_OPTIONS.find((o) => o.value === driverType);

  return (
    <div className="animate-fade-in">
      <Link to="/drivers" className="btn-ghost mb-4 !px-0 text-zinc-500">
        <ArrowLeft className="h-4 w-4" />
        Back to Drivers
      </Link>

      <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
        {/* Title */}
        <div className="px-6 pt-6 pb-2">
          <input
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              markDirty();
            }}
            placeholder="Driver title"
            className="w-full border-none bg-transparent text-xl font-semibold text-zinc-900 outline-none placeholder:text-zinc-300"
            autoFocus={isNew}
          />
        </div>

        {/* Type selector */}
        <div className="px-6 py-4">
          <label className="label">Type</label>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {DRIVER_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => {
                  setDriverType(opt.value);
                  markDirty();
                }}
                className={cn(
                  "rounded-lg border px-3 py-2.5 text-left transition-all",
                  driverType === opt.value
                    ? "border-indigo-300 bg-indigo-50 ring-1 ring-indigo-200"
                    : "border-zinc-200 bg-white hover:border-zinc-300 hover:bg-zinc-50",
                )}
              >
                <div className="flex items-center gap-2">
                  <DriverTypeBadge type={opt.value} />
                </div>
                <p className="mt-1.5 text-xs text-zinc-500 leading-relaxed">{opt.hint}</p>
              </button>
            ))}
          </div>
        </div>

        {/* Description */}
        <div className="border-t border-zinc-100 px-6 py-4">
          <label className="label">Description</label>
          <textarea
            value={description}
            onChange={(e) => {
              setDescription(e.target.value);
              markDirty();
            }}
            placeholder="What does this driver represent? What areas of life or work does it cover?"
            rows={5}
            className="input resize-none text-sm"
          />
        </div>

        {/* Parent Driver (for new or child drivers) */}
        {(isNew || isChildDriver || (!hasChildren && !isNew)) && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <label className="label">Parent Driver</label>
            {currentParent ? (
              <div className="flex items-center gap-2">
                <Link
                  to={`/drivers/${currentParent.id}`}
                  className="flex items-center gap-2 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 transition-colors"
                >
                  <DriverTypeBadge type={currentParent.driver_type} />
                  {currentParent.title}
                  <ChevronRight className="h-3.5 w-3.5 text-zinc-400" />
                </Link>
                <button
                  onClick={handleRemoveParent}
                  className="rounded-md p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-red-500 transition-colors"
                  title="Remove parent"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
            ) : showParentPicker ? (
              <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {availableParents.map((d) => (
                    <button
                      key={d.id}
                      onClick={() => handleSetParent(d.id)}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white transition-colors"
                    >
                      <DriverTypeBadge type={d.driver_type} />
                      <span className="text-zinc-700">{d.title}</span>
                    </button>
                  ))}
                  {availableParents.length === 0 && (
                    <p className="text-xs text-zinc-400 py-1">No available root drivers</p>
                  )}
                </div>
                <button
                  onClick={() => setShowParentPicker(false)}
                  className="btn-ghost mt-2 w-full text-xs"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={() => setShowParentPicker(true)}
                className="flex items-center gap-1.5 rounded-lg border border-dashed border-zinc-300 px-3 py-2 text-sm text-zinc-500 hover:border-zinc-400 hover:text-zinc-600 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Set parent driver
              </button>
            )}
            {!isNew && !isChildDriver && hasChildren && null}
          </div>
        )}

        {/* Child Drivers (only for saved root drivers) */}
        {!isNew && !isChildDriver && (
          <div className="border-t border-zinc-100 px-6 py-4">
            <div className="mb-3 flex items-center justify-between">
              <label className="label mb-0">Child Drivers</label>
              {!showChildPicker && (
                <button
                  onClick={() => setShowChildPicker(true)}
                  className="btn-ghost !px-2 !py-1 text-xs"
                >
                  <Plus className="h-3.5 w-3.5" />
                  Link
                </button>
              )}
            </div>

            <div className="space-y-1.5">
              {childDrivers.map((child) => (
                <div
                  key={child.id}
                  className="group flex items-center gap-2 rounded-lg border border-zinc-100 px-3 py-2"
                >
                  <DriverTypeBadge type={child.driver_type} />
                  <Link
                    to={`/drivers/${child.id}`}
                    className="flex-1 text-sm text-zinc-700 hover:text-indigo-600 transition-colors"
                  >
                    {child.title}
                  </Link>
                  {child.state !== "archived" && (
                    <button
                      onClick={() => handleRemoveChild(child.id)}
                      className="rounded p-1 text-zinc-400 opacity-0 transition-opacity hover:text-red-500 group-hover:opacity-100"
                      title="Remove as child"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              ))}
              {childDrivers.length === 0 && !showChildPicker && (
                <p className="text-xs italic text-zinc-400">No child drivers</p>
              )}
            </div>

            {showChildPicker && (
              <div className="mt-3 rounded-lg border border-zinc-200 bg-zinc-50 p-3">
                <p className="mb-2 text-xs font-medium text-zinc-500">Select a driver to add as child:</p>
                <div className="max-h-48 space-y-1 overflow-y-auto">
                  {availableChildCandidates
                    .filter((d) => !childDrivers.some((c) => c.id === d.id))
                    .map((d) => (
                      <button
                        key={d.id}
                        onClick={() => handleAdoptChild(d.id)}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm hover:bg-white transition-colors"
                      >
                        <DriverTypeBadge type={d.driver_type} />
                        <span className="text-zinc-700">{d.title}</span>
                      </button>
                    ))}
                  {availableChildCandidates.filter((d) => !childDrivers.some((c) => c.id === d.id))
                    .length === 0 && (
                    <p className="text-xs text-zinc-400 py-1">No available drivers to link</p>
                  )}
                </div>
                <button
                  onClick={() => setShowChildPicker(false)}
                  className="btn-ghost mt-2 w-full text-xs"
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-zinc-100 bg-zinc-50/80 px-6 py-4">
          <div className="text-xs text-zinc-400">
            {driver && (
              <>
                {driver.state === "archived" && (
                  <span className="mr-2 inline-flex items-center rounded-md bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-500">
                    Archived
                  </span>
                )}
                Created {formatDate(driver.created_at)} &middot; Updated{" "}
                {formatDate(driver.updated_at)} &middot; v{driver.version}
              </>
            )}
          </div>
          <div className="flex items-center gap-2">
            {!isNew && driver?.state !== "archived" && (
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
              {isNew ? "Create Driver" : "Save Changes"}
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
