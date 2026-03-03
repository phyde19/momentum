import { cn } from "../lib/utils";
import type { DriverType, InitiativeState, TaskPriority, TaskStatus } from "../lib/types";

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

// ── Driver type badge ───────────────────────────────────────────────────────

const driverTypeStyles: Record<DriverType, string> = {
  obligation: "bg-indigo-50 text-indigo-700 ring-1 ring-inset ring-indigo-600/20",
  risk: "bg-red-50 text-red-700 ring-1 ring-inset ring-red-600/20",
  leverage: "bg-emerald-50 text-emerald-700 ring-1 ring-inset ring-emerald-600/20",
  surplus: "bg-violet-50 text-violet-700 ring-1 ring-inset ring-violet-600/20",
};

const driverTypeLabels: Record<DriverType, string> = {
  obligation: "Obligation",
  risk: "Risk",
  leverage: "Leverage",
  surplus: "Surplus",
};

export function DriverTypeBadge({ type }: { type: DriverType }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        driverTypeStyles[type],
      )}
    >
      {driverTypeLabels[type]}
    </span>
  );
}

// ── Initiative state badge ──────────────────────────────────────────────────

const initiativeStateStyles: Record<InitiativeState, string> = {
  active: "bg-emerald-50 text-emerald-700",
  paused: "bg-amber-50 text-amber-700",
  abandoned: "bg-zinc-100 text-zinc-500",
  completed: "bg-blue-50 text-blue-700",
  archived: "bg-zinc-100 text-zinc-400",
};

const initiativeStateLabels: Record<InitiativeState, string> = {
  active: "Active",
  paused: "Paused",
  abandoned: "Abandoned",
  completed: "Completed",
  archived: "Archived",
};

export function InitiativeStateBadge({ state }: { state: InitiativeState }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium",
        initiativeStateStyles[state],
      )}
    >
      {initiativeStateLabels[state]}
    </span>
  );
}
