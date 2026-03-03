import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Archive, Plus, Search, Target, X } from "lucide-react";
import { useArchiveInitiative, useDrivers, useInitiatives } from "../lib/hooks";
import type { DriverType, InitiativeState } from "../lib/types";
import { DriverTypeBadge, InitiativeStateBadge } from "../components/badges";
import { EmptyState } from "../components/empty-state";
import { LoadingSpinner } from "../components/loading";
import { cn, formatDate } from "../lib/utils";

const STATE_OPTIONS: { value: InitiativeState | ""; label: string }[] = [
  { value: "", label: "All states" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "abandoned", label: "Abandoned" },
];

export function InitiativesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const stateFilter = (searchParams.get("state") as InitiativeState) || undefined;

  const { data: initiatives, isLoading, error } = useInitiatives({
    state: stateFilter,
    query: search || undefined,
  });
  const { data: drivers } = useDrivers();
  const archiveMutation = useArchiveInitiative();

  const driverMap = useMemo(() => {
    const map = new Map<string, { title: string; driver_type: DriverType }>();
    drivers?.forEach((driver) => map.set(driver.id, { title: driver.title, driver_type: driver.driver_type }));
    return map;
  }, [drivers]);

  function updateFilter(key: string, value: string) {
    setSearchParams((prev) => {
      if (value) {
        prev.set(key, value);
      } else {
        prev.delete(key);
      }
      return prev;
    });
  }

  function handleSearch(value: string) {
    setSearch(value);
    updateFilter("q", value);
  }

  function handleArchive(initiativeId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Archive this initiative? Active tasks must be unlinked first.")) {
      archiveMutation.mutate(initiativeId);
    }
  }

  const hasFilters = !!stateFilter || !!search;

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Initiatives</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {initiatives
              ? `${initiatives.length} initiative${initiatives.length === 1 ? "" : "s"}`
              : "Loading..."}
          </p>
        </div>
        <Link to="/initiatives/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          New Initiative
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search initiatives..."
            className="input !pl-9"
          />
        </div>
        <select
          value={stateFilter ?? ""}
          onChange={(e) => updateFilter("state", e.target.value)}
          className="select w-auto"
        >
          {STATE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch("");
              setSearchParams({});
            }}
            className="btn-ghost text-xs"
          >
            <X className="h-3.5 w-3.5" />
            Clear
          </button>
        )}
      </div>

      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load initiatives: {(error as Error).message}
        </div>
      ) : initiatives && initiatives.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {initiatives.map((initiative, i) => (
            <Link
              key={initiative.id}
              to={`/initiatives/${initiative.id}`}
              className={cn(
                "group flex items-center gap-4 px-5 py-3.5 transition-colors duration-100 hover:bg-zinc-50",
                i > 0 && "border-t border-zinc-100",
              )}
            >
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    initiative.state === "archived" ? "text-zinc-400" : "text-zinc-900",
                  )}
                >
                  {initiative.title}
                </p>
                {initiative.description && (
                  <p className="mt-0.5 truncate text-xs text-zinc-400">{initiative.description}</p>
                )}
              </div>

              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                <InitiativeStateBadge state={initiative.state} />
                {initiative.driver_ids[0] && driverMap.get(initiative.driver_ids[0]) && (
                  <DriverTypeBadge type={driverMap.get(initiative.driver_ids[0])!.driver_type} />
                )}
              </div>

              {(initiative.due_end_at || initiative.due_start_at) && (
                <span className="hidden shrink-0 text-xs text-zinc-400 md:block">
                  {formatDate(initiative.due_end_at ?? initiative.due_start_at)}
                </span>
              )}

              {initiative.state !== "archived" && (
                <button
                  onClick={(e) => handleArchive(initiative.id, e)}
                  className="shrink-0 rounded-md p-1.5 text-zinc-300 opacity-0 transition-all hover:bg-zinc-100 hover:text-zinc-500 group-hover:opacity-100"
                  title="Archive initiative"
                >
                  <Archive className="h-4 w-4" />
                </button>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={Target}
          title={hasFilters ? "No matching initiatives" : "No initiatives yet"}
          description={
            hasFilters
              ? "Try adjusting your filters or search query."
              : "Create your first initiative to organize larger work streams."
          }
          action={
            !hasFilters && (
              <Link to="/initiatives/new" className="btn-primary">
                <Plus className="h-4 w-4" />
                Create Initiative
              </Link>
            )
          }
        />
      )}
    </div>
  );
}

