export type GoalType = "path" | "vehicle" | "general";
export type GoalState = "active" | "paused" | "abandoned" | "completed" | "archived";
export type TaskStatus = "todo" | "in_progress" | "blocked" | "done" | "archived";
export type TaskPriority = "low" | "medium" | "high" | "critical";

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
  author_type: "human" | "agent" | "system";
  author_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface GoalReason {
  id: string;
  goal_id: string;
  reason_text: string;
  author_type: "human" | "agent" | "system";
  author_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface AuditEvent {
  id: number;
  actor_type: "human" | "agent" | "system";
  actor_id: string;
  action: string;
  entity_type: string;
  entity_id: string | null;
  request_id: string | null;
  before_json: Record<string, unknown> | null;
  after_json: Record<string, unknown> | null;
  metadata_json: Record<string, unknown> | null;
  created_at: string;
}
