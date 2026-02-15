import type {
  Goal,
  GoalCreate,
  GoalListParams,
  GoalReason,
  GoalUpdate,
  LinkGoalsRequest,
  ReasonCreate,
  ReasonUpdate,
  Task,
  TaskCreate,
  TaskListParams,
  TaskReason,
  TaskUpdate,
} from "./types";

// ── Config ──────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";
const DEV_EMAIL = import.meta.env.VITE_DEV_USER_EMAIL || "owner@example.com";
const API_PREFIX = "/v1";

// ── Fetch wrapper ───────────────────────────────────────────────────────────

function qs(params?: Record<string, string | number | boolean | null | undefined>): string {
  if (!params) return "";
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  );
  if (entries.length === 0) return "";
  return "?" + new URLSearchParams(entries.map(([k, v]) => [k, String(v)])).toString();
}

class ApiError extends Error {
  status: number;
  detail: string;
  constructor(status: number, detail: string) {
    super(detail);
    this.name = "ApiError";
    this.status = status;
    this.detail = detail;
  }
}

async function apiFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const url = `${API_BASE}${API_PREFIX}${path}`;
  const headers: HeadersInit = {
    "Content-Type": "application/json",
    "X-Dev-User-Email": DEV_EMAIL,
    ...(options?.headers as Record<string, string>),
  };

  const response = await fetch(url, { ...options, headers });

  if (!response.ok) {
    const body = await response.json().catch(() => ({ detail: "Request failed" }));
    throw new ApiError(response.status, body.detail || `HTTP ${response.status}`);
  }

  const text = await response.text();
  if (!text) return undefined as T;
  return JSON.parse(text) as T;
}

// ── API methods ─────────────────────────────────────────────────────────────

export const api = {
  // Tasks
  listTasks: (params?: TaskListParams) =>
    apiFetch<Task[]>(`/tasks${qs(params as Record<string, string | number | boolean | null | undefined>)}`),

  getTask: (id: string) =>
    apiFetch<Task>(`/tasks/${id}`),

  createTask: (data: TaskCreate) =>
    apiFetch<Task>("/tasks", { method: "POST", body: JSON.stringify(data) }),

  updateTask: (id: string, data: TaskUpdate) =>
    apiFetch<Task>(`/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  archiveTask: (id: string) =>
    apiFetch<Task>(`/tasks/${id}`, { method: "DELETE" }),

  linkTaskGoals: (taskId: string, data: LinkGoalsRequest) =>
    apiFetch<Task>(`/tasks/${taskId}/links/goals`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  unlinkTaskGoal: (taskId: string, goalId: string) =>
    apiFetch<Task>(`/tasks/${taskId}/links/goals/${goalId}`, { method: "DELETE" }),

  // Task reasons
  listTaskReasons: (taskId: string) =>
    apiFetch<TaskReason[]>(`/tasks/${taskId}/reasons`),

  addTaskReason: (taskId: string, data: ReasonCreate) =>
    apiFetch<TaskReason>(`/tasks/${taskId}/reasons`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateTaskReason: (reasonId: string, data: ReasonUpdate) =>
    apiFetch<TaskReason>(`/tasks/reasons/${reasonId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteTaskReason: (reasonId: string) =>
    apiFetch<{ status: string }>(`/tasks/reasons/${reasonId}`, { method: "DELETE" }),

  // Goals
  listGoals: (params?: GoalListParams) =>
    apiFetch<Goal[]>(`/goals${qs(params as Record<string, string | number | boolean | null | undefined>)}`),

  getGoal: (id: string) =>
    apiFetch<Goal>(`/goals/${id}`),

  createGoal: (data: GoalCreate) =>
    apiFetch<Goal>("/goals", { method: "POST", body: JSON.stringify(data) }),

  updateGoal: (id: string, data: GoalUpdate) =>
    apiFetch<Goal>(`/goals/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  archiveGoal: (id: string) =>
    apiFetch<Goal>(`/goals/${id}`, { method: "DELETE" }),

  // Goal reasons
  listGoalReasons: (goalId: string) =>
    apiFetch<GoalReason[]>(`/goals/${goalId}/reasons`),

  addGoalReason: (goalId: string, data: ReasonCreate) =>
    apiFetch<GoalReason>(`/goals/${goalId}/reasons`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateGoalReason: (reasonId: string, data: ReasonUpdate) =>
    apiFetch<GoalReason>(`/goals/reasons/${reasonId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteGoalReason: (reasonId: string) =>
    apiFetch<{ status: string }>(`/goals/reasons/${reasonId}`, { method: "DELETE" }),
};

export { ApiError };
