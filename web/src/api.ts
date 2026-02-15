import type { AuditEvent, Goal, GoalReason, Task, TaskReason } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8000";
const DEV_USER_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL ?? "owner@example.com";
const API_PREFIX = "/v1";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Dev-User-Email": DEV_USER_EMAIL,
    ...(init?.headers as Record<string, string>),
  };

  const response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, {
    ...init,
    headers,
  });

  if (!response.ok) {
    let message = `Request failed: ${response.status}`;
    try {
      const payload = await response.json();
      if (payload?.detail) {
        message = payload.detail;
      }
    } catch {
      // Ignore parse errors on error responses.
    }
    throw new Error(message);
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// ---------------------------------------------------------------------------
// Goals
// ---------------------------------------------------------------------------

export function listGoals(includeDeleted = false): Promise<Goal[]> {
  return request<Goal[]>(`/goals?include_deleted=${includeDeleted}`);
}

export function getGoal(goalId: string): Promise<Goal> {
  return request<Goal>(`/goals/${goalId}`);
}

export function createGoal(payload: {
  title: string;
  description?: string;
  goal_type: Goal["goal_type"];
  state?: Goal["state"];
  parent_goal_id?: string | null;
}): Promise<Goal> {
  return request<Goal>("/goals", { method: "POST", body: JSON.stringify(payload) });
}

export function updateGoal(
  goalId: string,
  payload: Partial<Pick<Goal, "title" | "description" | "goal_type" | "state" | "parent_goal_id">>,
): Promise<Goal> {
  return request<Goal>(`/goals/${goalId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function archiveGoal(goalId: string): Promise<Goal> {
  return request<Goal>(`/goals/${goalId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Goal Reasons
// ---------------------------------------------------------------------------

export function listGoalReasons(goalId: string): Promise<GoalReason[]> {
  return request<GoalReason[]>(`/goals/${goalId}/reasons`);
}

export function createGoalReason(goalId: string, reasonText: string): Promise<GoalReason> {
  return request<GoalReason>(`/goals/${goalId}/reasons`, {
    method: "POST",
    body: JSON.stringify({ reason_text: reasonText }),
  });
}

export function updateGoalReason(reasonId: string, reasonText: string): Promise<GoalReason> {
  return request<GoalReason>(`/goals/reasons/${reasonId}`, {
    method: "PATCH",
    body: JSON.stringify({ reason_text: reasonText }),
  });
}

export function deleteGoalReason(reasonId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/goals/reasons/${reasonId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export function listTasks(options?: {
  includeDeleted?: boolean;
  goalId?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  query?: string;
}): Promise<Task[]> {
  const params = new URLSearchParams();
  if (options?.includeDeleted) params.set("include_deleted", "true");
  if (options?.goalId) params.set("goal_id", options.goalId);
  if (options?.status) params.set("status", options.status);
  if (options?.priority) params.set("priority", options.priority);
  if (options?.query) params.set("query", options.query);
  const qs = params.toString();
  return request<Task[]>(`/tasks${qs ? `?${qs}` : ""}`);
}

export function getTask(taskId: string): Promise<Task> {
  return request<Task>(`/tasks/${taskId}`);
}

export function createTask(payload: {
  title: string;
  description?: string;
  status?: Task["status"];
  priority?: Task["priority"];
  due_at?: string | null;
  goal_ids?: string[];
  primary_goal_id?: string | null;
}): Promise<Task> {
  return request<Task>("/tasks", { method: "POST", body: JSON.stringify(payload) });
}

export function updateTask(
  taskId: string,
  payload: Partial<Pick<Task, "title" | "description" | "status" | "priority" | "due_at">>,
): Promise<Task> {
  return request<Task>(`/tasks/${taskId}`, { method: "PATCH", body: JSON.stringify(payload) });
}

export function archiveTask(taskId: string): Promise<Task> {
  return request<Task>(`/tasks/${taskId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Task-Goal Links
// ---------------------------------------------------------------------------

export function linkTaskGoals(
  taskId: string,
  goalIds: string[],
  primaryGoalId?: string | null,
): Promise<Task> {
  return request<Task>(`/tasks/${taskId}/links/goals`, {
    method: "POST",
    body: JSON.stringify({ goal_ids: goalIds, primary_goal_id: primaryGoalId }),
  });
}

export function unlinkTaskGoal(taskId: string, goalId: string): Promise<Task> {
  return request<Task>(`/tasks/${taskId}/links/goals/${goalId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Task Reasons
// ---------------------------------------------------------------------------

export function listTaskReasons(taskId: string): Promise<TaskReason[]> {
  return request<TaskReason[]>(`/tasks/${taskId}/reasons`);
}

export function createTaskReason(taskId: string, reasonText: string): Promise<TaskReason> {
  return request<TaskReason>(`/tasks/${taskId}/reasons`, {
    method: "POST",
    body: JSON.stringify({ reason_text: reasonText }),
  });
}

export function updateTaskReason(reasonId: string, reasonText: string): Promise<TaskReason> {
  return request<TaskReason>(`/tasks/reasons/${reasonId}`, {
    method: "PATCH",
    body: JSON.stringify({ reason_text: reasonText }),
  });
}

export function deleteTaskReason(reasonId: string): Promise<{ status: string }> {
  return request<{ status: string }>(`/tasks/reasons/${reasonId}`, { method: "DELETE" });
}

// ---------------------------------------------------------------------------
// Audit
// ---------------------------------------------------------------------------

export function listAuditEvents(limit = 100): Promise<AuditEvent[]> {
  return request<AuditEvent[]>(`/audit-events?limit=${limit}`);
}
