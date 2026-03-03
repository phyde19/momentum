// ── Enums mirroring backend ──────────────────────────────────────────────────

export type DriverType = "obligation" | "risk" | "leverage" | "surplus";
export type DriverState = "active" | "archived";
export type InitiativeState = "active" | "paused" | "abandoned" | "completed" | "archived";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "archived";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type TaskRecurrence = "daily" | "weekly" | "monthly" | "custom";
export type ActorType = "human" | "agent" | "system";

// ── Response types ──────────────────────────────────────────────────────────

export interface Driver {
  id: string;
  title: string;
  description: string | null;
  driver_type: DriverType;
  state: DriverState;
  parent_driver_id: string | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface DriverTreeNode {
  id: string;
  title: string;
  description: string | null;
  driver_type: DriverType;
  state: DriverState;
  parent_driver_id: string | null;
  children: DriverTreeNode[];
}

export interface Initiative {
  id: string;
  title: string;
  description: string | null;
  state: InitiativeState;
  due_start_at: string | null;
  due_end_at: string | null;
  driver_ids: string[];
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface ChecklistItem {
  title: string;
  is_done: boolean;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  initiative_id: string | null;
  due_start_at: string | null;
  due_end_at: string | null;
  recurrence: TaskRecurrence | null;
  recurrence_interval: number | null;
  recurrence_rule: string | null;
  recurrence_until: string | null;
  checklist_json: ChecklistItem[];
  driver_ids: string[];
  created_by: string;
  updated_by: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface TaskReason {
  id: string;
  task_id: string;
  reason_text: string;
  author_type: ActorType;
  author_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InitiativeReason {
  id: string;
  initiative_id: string;
  reason_text: string;
  author_type: ActorType;
  author_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ── Request types ───────────────────────────────────────────────────────────

export interface TaskCreate {
  title: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  initiative_id?: string | null;
  due_start_at?: string | null;
  due_end_at?: string | null;
  recurrence?: TaskRecurrence | null;
  recurrence_interval?: number | null;
  recurrence_rule?: string | null;
  recurrence_until?: string | null;
  checklist_json?: ChecklistItem[];
  driver_ids?: string[];
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  initiative_id?: string | null;
  due_start_at?: string | null;
  due_end_at?: string | null;
  recurrence?: TaskRecurrence | null;
  recurrence_interval?: number | null;
  recurrence_rule?: string | null;
  recurrence_until?: string | null;
  checklist_json?: ChecklistItem[];
  driver_ids?: string[];
}

export interface InitiativeCreate {
  title: string;
  description?: string | null;
  state?: InitiativeState;
  due_start_at?: string | null;
  due_end_at?: string | null;
  driver_ids?: string[];
}

export interface InitiativeUpdate {
  title?: string;
  description?: string | null;
  state?: InitiativeState;
  due_start_at?: string | null;
  due_end_at?: string | null;
  driver_ids?: string[];
}

export interface DriverCreate {
  title: string;
  description?: string | null;
  driver_type: DriverType;
  state?: DriverState;
  parent_driver_id?: string | null;
}

export interface DriverUpdate {
  title?: string;
  description?: string | null;
  driver_type?: DriverType;
  state?: DriverState;
  parent_driver_id?: string | null;
}

export interface LinkDriversRequest {
  driver_ids: string[];
}

export interface ReasonCreate {
  reason_text: string;
}

export interface ReasonUpdate {
  reason_text: string;
}

// ── Query params ────────────────────────────────────────────────────────────

export interface TaskListParams {
  include_deleted?: boolean;
  initiative_id?: string;
  driver_id?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface InitiativeListParams {
  include_deleted?: boolean;
  state?: InitiativeState;
  driver_id?: string;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface DriverListParams {
  include_deleted?: boolean;
  driver_type?: DriverType;
  state?: DriverState;
  parent_driver_id?: string | null;
}
