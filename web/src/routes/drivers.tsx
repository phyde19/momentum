import { useMemo } from "react";
import { Link } from "react-router";
import { Archive, Plus } from "lucide-react";
import { useArchiveDriver, useDrivers } from "../lib/hooks";
import { DriverTypeBadge } from "../components/badges";
import { LoadingSpinner } from "../components/loading";
import { cn, formatDate } from "../lib/utils";
import { showToast } from "../components/toast";

export function DriversPage() {
  const { data: drivers, isLoading, error } = useDrivers();
  const archiveMutation = useArchiveDriver();

  const sorted = useMemo(() => {
    if (!drivers) return [];
    const active = drivers.filter((d) => !d.deleted_at);
    const roots = active.filter((d) => !d.parent_driver_id);
    const result: typeof active = [];
    for (const root of roots) {
      result.push(root);
      const children = active.filter((d) => d.parent_driver_id === root.id);
      result.push(...children);
    }
    const orphans = active.filter(
      (d) => d.parent_driver_id && !active.some((r) => r.id === d.parent_driver_id),
    );
    result.push(...orphans);
    return result;
  }, [drivers]);

  function handleArchive(e: React.MouseEvent, driverId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Archive this driver?")) {
      archiveMutation.mutate(driverId, {
        onSuccess: () => showToast("success", "Driver archived"),
        onError: (err) => showToast("error", err.message),
      });
    }
  }

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Drivers</h1>
          <p className="mt-1 text-sm text-zinc-500">
            Top-level categories for obligations, risk, leverage, and surplus.
          </p>
        </div>
        <Link to="/drivers/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          New Driver
        </Link>
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load drivers: {(error as Error).message}
        </div>
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-zinc-200 bg-white p-12 text-center shadow-sm">
          <p className="text-sm text-zinc-500">No drivers yet</p>
          <Link to="/drivers/new" className="btn-primary mt-4 inline-flex">
            <Plus className="h-4 w-4" />
            Create your first driver
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {sorted.map((driver, idx) => {
            const isChild = !!driver.parent_driver_id;
            return (
              <Link
                key={driver.id}
                to={`/drivers/${driver.id}`}
                className={cn(
                  "flex items-center gap-3 px-5 py-3.5 transition-colors hover:bg-zinc-50",
                  idx > 0 && "border-t border-zinc-100",
                  isChild && "pl-10",
                  driver.state === "archived" && "opacity-50",
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium text-zinc-900">{driver.title}</p>
                  </div>
                  {driver.description && (
                    <p className="mt-0.5 truncate text-xs text-zinc-400">{driver.description}</p>
                  )}
                </div>
                <div className="hidden items-center gap-2 sm:flex">
                  <DriverTypeBadge type={driver.driver_type} />
                </div>
                <span className="hidden text-xs text-zinc-400 md:block">
                  {formatDate(driver.updated_at)}
                </span>
                {driver.state !== "archived" && (
                  <button
                    onClick={(e) => handleArchive(e, driver.id)}
                    className="rounded-md p-1.5 text-zinc-300 transition-all hover:bg-zinc-100 hover:text-zinc-500"
                    title="Archive driver"
                  >
                    <Archive className="h-4 w-4" />
                  </button>
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
