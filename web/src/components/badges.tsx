import { cn } from "../lib/utils";
import type { GoalState, GoalType, TaskPriority, TaskStatus } from "../lib/types";

// ── Status badge ────────────────────────────────────────────────────────────

const statusStyles: Record<TaskStatus, string> = {
  todo: "bg-zinc-100 text-zinc-600",
  in_progress: "bg-blue-50 text-blue-700 ring-1 ring-inset ring-blue-600/20",
  blocked: "bg-amber-50 text-amber-700 ring-1 ring-inset ring-amber-600/20",
  done: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  archived: "bg-zinc-100 text-zinc-500",
};

const statusLabels: Record<TaskStatus, string> = {
  todo: "Todo",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  archived: "Archived",
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        statusStyles[status],
      )}
    >
      {statusLabels[status]}
    </span>
  );
}

// ── Priority badge ──────────────────────────────────────────────────────────

const priorityStyles: Record<TaskPriority, string> = {
  low: "bg-zinc-100 text-zinc-500",
  medium: "bg-blue-50 text-blue-600",
  high: "bg-amber-50 text-amber-700",
  critical: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
};

const priorityLabels: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export function PriorityBadge({ priority }: { priority: TaskPriority }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        priorityStyles[priority],
      )}
    >
      {priorityLabels[priority]}
    </span>
  );
}

// ── Goal type badge ─────────────────────────────────────────────────────────

const goalTypeStyles: Record<GoalType, string> = {
  path: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20",
  vehicle: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  general: "bg-zinc-100 text-zinc-600",
};

const goalTypeLabels: Record<GoalType, string> = {
  path: "Path",
  vehicle: "Vehicle",
  general: "General",
};

export function GoalTypeBadge({ type }: { type: GoalType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        goalTypeStyles[type],
      )}
    >
      {goalTypeLabels[type]}
    </span>
  );
}

// ── Goal state badge ────────────────────────────────────────────────────────

const goalStateStyles: Record<GoalState, string> = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  abandoned: "bg-zinc-100 text-zinc-500",
  completed: "bg-blue-50 text-blue-700",
  archived: "bg-zinc-100 text-zinc-400",
};

const goalStateLabels: Record<GoalState, string> = {
  active: "Active",
  paused: "Paused",
  abandoned: "Abandoned",
  completed: "Completed",
  archived: "Archived",
};

export function GoalStateBadge({ state }: { state: GoalState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        goalStateStyles[state],
      )}
    >
      {goalStateLabels[state]}
    </span>
  );
}
