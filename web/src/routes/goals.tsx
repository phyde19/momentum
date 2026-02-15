import { useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Target, Plus, Search, Archive, X, Star } from "lucide-react";
import { useGoals, useArchiveGoal } from "../lib/hooks";
import type { GoalType, GoalState } from "../lib/types";
import { GoalTypeBadge, GoalStateBadge } from "../components/badges";
import { EmptyState } from "../components/empty-state";
import { LoadingSpinner } from "../components/loading";
import { formatDate, cn } from "../lib/utils";

const TYPE_TABS: { value: GoalType | ""; label: string }[] = [
  { value: "", label: "All" },
  { value: "path", label: "Paths" },
  { value: "vehicle", label: "Vehicles" },
  { value: "general", label: "General" },
];

const STATE_OPTIONS: { value: GoalState | ""; label: string }[] = [
  { value: "", label: "All states" },
  { value: "active", label: "Active" },
  { value: "paused", label: "Paused" },
  { value: "completed", label: "Completed" },
  { value: "abandoned", label: "Abandoned" },
];

export function GoalsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const typeFilter = (searchParams.get("type") as GoalType) || undefined;
  const stateFilter = (searchParams.get("state") as GoalState) || undefined;

  const { data: goals, isLoading, error } = useGoals({
    goal_type: typeFilter,
    state: stateFilter,
  });

  const archiveMutation = useArchiveGoal();

  // Client-side search filter (API doesn't support query param for goals)
  const filteredGoals = goals?.filter((g) => {
    if (!search) return true;
    const term = search.toLowerCase();
    return (
      g.title.toLowerCase().includes(term) ||
      (g.description?.toLowerCase().includes(term) ?? false)
    );
  });

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

  function handleArchive(goalId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Archive this goal? Active tasks must be unlinked first.")) {
      archiveMutation.mutate(goalId);
    }
  }

  const hasFilters = !!typeFilter || !!stateFilter || !!search;

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Goals</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {filteredGoals
              ? `${filteredGoals.length} goal${filteredGoals.length === 1 ? "" : "s"}`
              : "Loading..."}
          </p>
        </div>
        <Link to="/goals/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          New Goal
        </Link>
      </div>

      {/* Type tabs */}
      <div className="mb-4 flex items-center gap-1 rounded-lg bg-zinc-100 p-1">
        {TYPE_TABS.map((tab) => (
          <button
            key={tab.value}
            onClick={() => updateFilter("type", tab.value)}
            className={cn(
              "rounded-md px-3.5 py-1.5 text-sm font-medium transition-all duration-150",
              (typeFilter ?? "") === tab.value
                ? "bg-white text-zinc-900 shadow-sm"
                : "text-zinc-500 hover:text-zinc-700",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Search and state filter */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search goals..."
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

      {/* Goal list */}
      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load goals: {(error as Error).message}
        </div>
      ) : filteredGoals && filteredGoals.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {filteredGoals.map((goal, i) => (
            <Link
              key={goal.id}
              to={`/goals/${goal.id}`}
              className={cn(
                "group flex items-center gap-4 px-5 py-3.5 transition-colors duration-100 hover:bg-zinc-50",
                i > 0 && "border-t border-zinc-100",
              )}
            >
              {/* Type indicator */}
              <div
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  goal.goal_type === "path" && "bg-violet-500",
                  goal.goal_type === "vehicle" && "bg-emerald-500",
                  goal.goal_type === "general" && "bg-zinc-300",
                )}
              />

              {/* Title + description */}
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p
                    className={cn(
                      "truncate text-sm font-medium",
                      goal.state === "archived"
                        ? "text-zinc-400"
                        : "text-zinc-900",
                    )}
                  >
                    {goal.title}
                  </p>
                  {goal.is_default && (
                    <Star className="h-3.5 w-3.5 shrink-0 fill-amber-400 text-amber-400" />
                  )}
                </div>
                {goal.description && (
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    {goal.description}
                  </p>
                )}
              </div>

              {/* Badges */}
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                <GoalTypeBadge type={goal.goal_type} />
                <GoalStateBadge state={goal.state} />
              </div>

              {/* Updated */}
              <span className="hidden shrink-0 text-xs text-zinc-400 md:block">
                {formatDate(goal.updated_at)}
              </span>

              {/* Archive button */}
              {!goal.is_default && goal.state !== "archived" && (
                <button
                  onClick={(e) => handleArchive(goal.id, e)}
                  className="shrink-0 rounded-md p-1.5 text-zinc-300 opacity-0 transition-all hover:bg-zinc-100 hover:text-zinc-500 group-hover:opacity-100"
                  title="Archive goal"
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
          title={hasFilters ? "No matching goals" : "No goals yet"}
          description={
            hasFilters
              ? "Try adjusting your filters or search query."
              : "Create your first goal to start organizing your tasks."
          }
          action={
            !hasFilters && (
              <Link to="/goals/new" className="btn-primary">
                <Plus className="h-4 w-4" />
                Create Goal
              </Link>
            )
          }
        />
      )}

      {/* Archive error toast */}
      {archiveMutation.error && (
        <div className="fixed bottom-4 right-4 z-50 animate-slide-up rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-lg">
          {(archiveMutation.error as Error).message}
        </div>
      )}
    </div>
  );
}
