import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { CalendarClock, Plus, Search, Archive, X, Repeat } from "lucide-react";
import { useArchiveSchedule, useSchedules, useInitiatives } from "../lib/hooks";
import { EmptyState } from "../components/empty-state";
import { LoadingSpinner } from "../components/loading";
import { cn } from "../lib/utils";

function formatBlockWindow(startsAt: string, endsAt: string): string {
  const s = new Date(startsAt);
  const e = new Date(endsAt);

  const dateOpts: Intl.DateTimeFormatOptions = { month: "short", day: "numeric" };
  const timeOpts: Intl.DateTimeFormatOptions = { hour: "numeric", minute: "2-digit" };

  const sameDay =
    s.getFullYear() === e.getFullYear() &&
    s.getMonth() === e.getMonth() &&
    s.getDate() === e.getDate();

  if (sameDay) {
    return `${s.toLocaleDateString(undefined, dateOpts)}, ${s.toLocaleTimeString(undefined, timeOpts)} – ${e.toLocaleTimeString(undefined, timeOpts)}`;
  }
  return `${s.toLocaleDateString(undefined, dateOpts)} ${s.toLocaleTimeString(undefined, timeOpts)} – ${e.toLocaleDateString(undefined, dateOpts)} ${e.toLocaleTimeString(undefined, timeOpts)}`;
}

export function SchedulesPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const { data: schedules, isLoading, error } = useSchedules({
    query: search || undefined,
  });

  const { data: initiatives } = useInitiatives();
  const archiveMutation = useArchiveSchedule();

  const initiativeMap = useMemo(() => {
    const map = new Map<string, string>();
    initiatives?.forEach((init) => map.set(init.id, init.title));
    return map;
  }, [initiatives]);

  function handleSearch(value: string) {
    setSearch(value);
    setSearchParams((prev) => {
      if (value) prev.set("q", value);
      else prev.delete("q");
      return prev;
    });
  }

  function handleArchive(id: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Archive this schedule?")) {
      archiveMutation.mutate(id);
    }
  }

  const hasFilters = !!search;

  return (
    <div className="animate-fade-in">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Schedules</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {schedules ? `${schedules.length} schedule${schedules.length === 1 ? "" : "s"}` : "Loading..."}
          </p>
        </div>
        <Link to="/schedules/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          New Schedule
        </Link>
      </div>

      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search schedules..."
            className="input !pl-9"
          />
        </div>
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
          Failed to load schedules: {(error as Error).message}
        </div>
      ) : schedules && schedules.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {schedules.map((bg, i) => (
            <Link
              key={bg.id}
              to={`/schedules/${bg.id}`}
              className={cn(
                "group flex items-center gap-4 px-5 py-3.5 transition-colors duration-100 hover:bg-zinc-50",
                i > 0 && "border-t border-zinc-100",
              )}
            >
              <CalendarClock className="h-4 w-4 shrink-0 text-indigo-500" />

              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900">
                  {bg.title}
                </p>
                <p className="mt-0.5 truncate text-xs text-zinc-500">
                  {formatBlockWindow(bg.starts_at, bg.ends_at)}
                </p>
                {bg.initiative_id && initiativeMap.get(bg.initiative_id) && (
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    {initiativeMap.get(bg.initiative_id)}
                  </p>
                )}
              </div>

              {bg.periodic_type && (
                <span className="hidden shrink-0 items-center gap-1 rounded-md bg-violet-50 px-2 py-0.5 text-xs font-medium text-violet-700 ring-1 ring-inset ring-violet-600/20 sm:inline-flex">
                  <Repeat className="h-3 w-3" />
                  {bg.periodic_type}
                </span>
              )}

              {!bg.deleted_at && (
                <button
                  onClick={(e) => handleArchive(bg.id, e)}
                  className="shrink-0 rounded-md p-1.5 text-zinc-300 opacity-0 transition-all hover:bg-zinc-100 hover:text-zinc-500 group-hover:opacity-100"
                  title="Archive schedule"
                >
                  <Archive className="h-4 w-4" />
                </button>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CalendarClock}
          title={hasFilters ? "No matching schedules" : "No schedules yet"}
          description={
            hasFilters
              ? "Try adjusting your search query."
              : "Create your first schedule to plan time-bound activities."
          }
          action={
            !hasFilters && (
              <Link to="/schedules/new" className="btn-primary">
                <Plus className="h-4 w-4" />
                Create Schedule
              </Link>
            )
          }
        />
      )}
    </div>
  );
}
