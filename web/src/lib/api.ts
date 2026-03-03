import type {
  Driver,
  DriverCreate,
  DriverListParams,
  DriverTreeNode,
  DriverUpdate,
  Initiative,
  InitiativeCreate,
  InitiativeListParams,
  InitiativeReason,
  InitiativeUpdate,
  LinkDriversRequest,
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

  linkTaskDrivers: (taskId: string, data: LinkDriversRequest) =>
    apiFetch<Task>(`/tasks/${taskId}/links/drivers`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  unlinkTaskDriver: (taskId: string, driverId: string) =>
    apiFetch<Task>(`/tasks/${taskId}/links/drivers/${driverId}`, { method: "DELETE" }),

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

  // Initiatives
  listInitiatives: (params?: InitiativeListParams) =>
    apiFetch<Initiative[]>(`/initiatives${qs(params as Record<string, string | number | boolean | null | undefined>)}`),

  getInitiative: (id: string) =>
    apiFetch<Initiative>(`/initiatives/${id}`),

  createInitiative: (data: InitiativeCreate) =>
    apiFetch<Initiative>("/initiatives", { method: "POST", body: JSON.stringify(data) }),

  updateInitiative: (id: string, data: InitiativeUpdate) =>
    apiFetch<Initiative>(`/initiatives/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  archiveInitiative: (id: string) =>
    apiFetch<Initiative>(`/initiatives/${id}`, { method: "DELETE" }),

  linkInitiativeDrivers: (initiativeId: string, data: LinkDriversRequest) =>
    apiFetch<Initiative>(`/initiatives/${initiativeId}/links/drivers`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  unlinkInitiativeDriver: (initiativeId: string, driverId: string) =>
    apiFetch<Initiative>(`/initiatives/${initiativeId}/links/drivers/${driverId}`, { method: "DELETE" }),

  // Initiative reasons
  listInitiativeReasons: (initiativeId: string) =>
    apiFetch<InitiativeReason[]>(`/initiatives/${initiativeId}/reasons`),

  addInitiativeReason: (initiativeId: string, data: ReasonCreate) =>
    apiFetch<InitiativeReason>(`/initiatives/${initiativeId}/reasons`, {
      method: "POST",
      body: JSON.stringify(data),
    }),

  updateInitiativeReason: (reasonId: string, data: ReasonUpdate) =>
    apiFetch<InitiativeReason>(`/initiatives/reasons/${reasonId}`, {
      method: "PATCH",
      body: JSON.stringify(data),
    }),

  deleteInitiativeReason: (reasonId: string) =>
    apiFetch<{ status: string }>(`/initiatives/reasons/${reasonId}`, { method: "DELETE" }),

  // Drivers
  listDrivers: (params?: DriverListParams) =>
    apiFetch<Driver[]>(`/drivers${qs(params as Record<string, string | number | boolean | null | undefined>)}`),

  getDriversTree: () =>
    apiFetch<DriverTreeNode[]>("/drivers/tree"),

  getDriver: (id: string) =>
    apiFetch<Driver>(`/drivers/${id}`),

  createDriver: (data: DriverCreate) =>
    apiFetch<Driver>("/drivers", { method: "POST", body: JSON.stringify(data) }),

  updateDriver: (id: string, data: DriverUpdate) =>
    apiFetch<Driver>(`/drivers/${id}`, { method: "PATCH", body: JSON.stringify(data) }),

  archiveDriver: (id: string) =>
    apiFetch<Driver>(`/drivers/${id}`, { method: "DELETE" }),
};

export { ApiError };
