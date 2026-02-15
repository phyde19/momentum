// ── Enums mirroring backend ──────────────────────────────────────────────────

export type GoalType = "path" | "vehicle" | "general";
export type GoalState = "active" | "paused" | "abandoned" | "completed" | "archived";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "archived";
export type TaskPriority = "low" | "medium" | "high" | "critical";
export type ActorType = "human" | "agent" | "system";

// ── Response types ──────────────────────────────────────────────────────────

export interface Goal {
  id: string;
  title: string;
  description: string | null;
  goal_type: GoalType;
  state: GoalState;
  parent_goal_id: string | null;
  is_default: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  version: number;
}

export interface Task {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  due_at: string | null;
  goal_ids: string[];
  primary_goal_id: string | null;
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

export interface GoalReason {
  id: string;
  goal_id: string;
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
  due_at?: string | null;
  goal_ids?: string[];
  primary_goal_id?: string | null;
}

export interface TaskUpdate {
  title?: string;
  description?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  due_at?: string | null;
}

export interface GoalCreate {
  title: string;
  description?: string | null;
  goal_type?: GoalType;
  state?: GoalState;
  parent_goal_id?: string | null;
}

export interface GoalUpdate {
  title?: string;
  description?: string | null;
  goal_type?: GoalType;
  state?: GoalState;
  parent_goal_id?: string | null;
}

export interface LinkGoalsRequest {
  goal_ids: string[];
  primary_goal_id?: string | null;
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
  goal_id?: string;
  status?: TaskStatus;
  priority?: TaskPriority;
  query?: string;
  limit?: number;
  offset?: number;
}

export interface GoalListParams {
  include_deleted?: boolean;
  goal_type?: GoalType;
  state?: GoalState;
}
