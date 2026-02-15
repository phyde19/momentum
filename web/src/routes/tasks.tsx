import { useState, useMemo } from "react";
import { Link, useSearchParams } from "react-router";
import { CheckSquare, Plus, Search, Archive, X } from "lucide-react";
import { useTasks, useGoals, useArchiveTask } from "../lib/hooks";
import type { TaskStatus, TaskPriority } from "../lib/types";
import { StatusBadge, PriorityBadge } from "../components/badges";
import { EmptyState } from "../components/empty-state";
import { LoadingSpinner } from "../components/loading";
import { formatDate, cn } from "../lib/utils";

const STATUS_OPTIONS: { value: TaskStatus | ""; label: string }[] = [
  { value: "", label: "All statuses" },
  { value: "todo", label: "Todo" },
  { value: "in_progress", label: "In Progress" },
  { value: "blocked", label: "Blocked" },
  { value: "done", label: "Done" },
];

const PRIORITY_OPTIONS: { value: TaskPriority | ""; label: string }[] = [
  { value: "", label: "All priorities" },
  { value: "critical", label: "Critical" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

export function TasksPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get("q") ?? "");

  const statusFilter = (searchParams.get("status") as TaskStatus) || undefined;
  const priorityFilter = (searchParams.get("priority") as TaskPriority) || undefined;

  const { data: tasks, isLoading, error } = useTasks({
    status: statusFilter,
    priority: priorityFilter,
    query: search || undefined,
  });

  const { data: goals } = useGoals();
  const archiveMutation = useArchiveTask();

  // Build a quick lookup of goal ID -> title
  const goalMap = useMemo(() => {
    const map = new Map<string, string>();
    goals?.forEach((g) => map.set(g.id, g.title));
    return map;
  }, [goals]);

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

  function handleArchive(taskId: string, e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (confirm("Archive this task?")) {
      archiveMutation.mutate(taskId);
    }
  }

  const hasFilters = !!statusFilter || !!priorityFilter || !!search;

  return (
    <div className="animate-fade-in">
      {/* Page header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-zinc-900">Tasks</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {tasks ? `${tasks.length} task${tasks.length === 1 ? "" : "s"}` : "Loading..."}
          </p>
        </div>
        <Link to="/tasks/new" className="btn-primary">
          <Plus className="h-4 w-4" />
          New Task
        </Link>
      </div>

      {/* Filters */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder="Search tasks..."
            className="input !pl-9"
          />
        </div>
        <select
          value={statusFilter ?? ""}
          onChange={(e) => updateFilter("status", e.target.value)}
          className="select w-auto"
        >
          {STATUS_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <select
          value={priorityFilter ?? ""}
          onChange={(e) => updateFilter("priority", e.target.value)}
          className="select w-auto"
        >
          {PRIORITY_OPTIONS.map((opt) => (
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

      {/* Task list */}
      {isLoading ? (
        <LoadingSpinner />
      ) : error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          Failed to load tasks: {(error as Error).message}
        </div>
      ) : tasks && tasks.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-sm">
          {tasks.map((task, i) => (
            <Link
              key={task.id}
              to={`/tasks/${task.id}`}
              className={cn(
                "group flex items-center gap-4 px-5 py-3.5 transition-colors duration-100 hover:bg-zinc-50",
                i > 0 && "border-t border-zinc-100",
              )}
            >
              {/* Status dot */}
              <div
                className={cn(
                  "h-2.5 w-2.5 shrink-0 rounded-full",
                  task.status === "done" && "bg-emerald-500",
                  task.status === "in_progress" && "bg-blue-500",
                  task.status === "blocked" && "bg-amber-500",
                  task.status === "todo" && "bg-zinc-300",
                  task.status === "archived" && "bg-zinc-200",
                )}
              />

              {/* Title + goal */}
              <div className="min-w-0 flex-1">
                <p
                  className={cn(
                    "truncate text-sm font-medium",
                    task.status === "done"
                      ? "text-zinc-400 line-through"
                      : "text-zinc-900",
                  )}
                >
                  {task.title}
                </p>
                {task.primary_goal_id && goalMap.get(task.primary_goal_id) && (
                  <p className="mt-0.5 truncate text-xs text-zinc-400">
                    {goalMap.get(task.primary_goal_id)}
                  </p>
                )}
              </div>

              {/* Badges */}
              <div className="hidden shrink-0 items-center gap-2 sm:flex">
                <StatusBadge status={task.status} />
                <PriorityBadge priority={task.priority} />
              </div>

              {/* Due date */}
              {task.due_at && (
                <span className="hidden shrink-0 text-xs text-zinc-400 md:block">
                  {formatDate(task.due_at)}
                </span>
              )}

              {/* Archive button */}
              {task.status !== "archived" && (
                <button
                  onClick={(e) => handleArchive(task.id, e)}
                  className="shrink-0 rounded-md p-1.5 text-zinc-300 opacity-0 transition-all hover:bg-zinc-100 hover:text-zinc-500 group-hover:opacity-100"
                  title="Archive task"
                >
                  <Archive className="h-4 w-4" />
                </button>
              )}
            </Link>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={CheckSquare}
          title={hasFilters ? "No matching tasks" : "No tasks yet"}
          description={
            hasFilters
              ? "Try adjusting your filters or search query."
              : "Create your first task to start tracking your work."
          }
          action={
            !hasFilters && (
              <Link to="/tasks/new" className="btn-primary">
                <Plus className="h-4 w-4" />
                Create Task
              </Link>
            )
          }
        />
      )}
    </div>
  );
}
