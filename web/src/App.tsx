import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import {
  archiveGoal,
  archiveTask,
  createGoal,
  createGoalReason,
  createTask,
  createTaskReason,
  deleteGoalReason,
  deleteTaskReason,
  listAuditEvents,
  listGoalReasons,
  listGoals,
  listTaskReasons,
  listTasks,
  updateGoalReason,
  updateTask,
  updateTaskReason,
} from "./api";
import type {
  AuditEvent,
  Goal,
  GoalReason,
  GoalType,
  Task,
  TaskPriority,
  TaskReason,
  TaskStatus,
} from "./types";
import "./styles.css";

type Tab = "tasks" | "goals" | "audit";

const STATUS_OPTIONS: TaskStatus[] = ["todo", "in_progress", "blocked", "done"];
const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: "To Do",
  in_progress: "In Progress",
  blocked: "Blocked",
  done: "Done",
  archived: "Archived",
};
const PRIORITY_OPTIONS: TaskPriority[] = ["low", "medium", "high", "critical"];
const PRIORITY_LABELS: Record<TaskPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};
const GOAL_TYPE_OPTIONS: GoalType[] = ["path", "vehicle", "general"];
const GOAL_TYPE_LABELS: Record<GoalType, string> = {
  path: "Path",
  vehicle: "Vehicle",
  general: "General",
};

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stopProp(e: React.MouseEvent) {
  e.stopPropagation();
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

export default function App() {
  const [tab, setTab] = useState<Tab>("tasks");
  const [error, setError] = useState<string | null>(null);

  const [goals, setGoals] = useState<Goal[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [audit, setAudit] = useState<AuditEvent[]>([]);

  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const [taskReasons, setTaskReasons] = useState<TaskReason[]>([]);
  const [goalReasons, setGoalReasons] = useState<GoalReason[]>([]);

  const [filterGoalId, setFilterGoalId] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [filterSearch, setFilterSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>();

  const activeGoals = goals.filter((g) => !g.deleted_at && g.state !== "archived");
  const selectedTask = tasks.find((t) => t.id === selectedTaskId) ?? null;
  const selectedGoal = goals.find((g) => g.id === selectedGoalId) ?? null;

  const goalMap = new Map(goals.map((g) => [g.id, g]));

  // ---- data loading -------------------------------------------------------

  async function safe(fn: () => Promise<void>) {
    try {
      setError(null);
      await fn();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unexpected error");
    }
  }

  const loadGoals = useCallback(async () => {
    const data = await listGoals();
    setGoals(data);
  }, []);

  const loadTasks = useCallback(
    async (opts?: { goalId?: string; status?: string; query?: string }) => {
      const data = await listTasks({
        goalId: opts?.goalId || undefined,
        status: (opts?.status as TaskStatus) || undefined,
        query: opts?.query || undefined,
      });
      setTasks(data);
    },
    [],
  );

  const loadAudit = useCallback(async () => {
    const data = await listAuditEvents(200);
    setAudit(data);
  }, []);

  const loadTaskReasons = useCallback(async (taskId: string) => {
    const data = await listTaskReasons(taskId);
    setTaskReasons(data);
  }, []);

  const loadGoalReasons = useCallback(async (goalId: string) => {
    const data = await listGoalReasons(goalId);
    setGoalReasons(data);
  }, []);

  const refreshAll = useCallback(async () => {
    await Promise.all([loadGoals(), loadTasks(), loadAudit()]);
  }, [loadGoals, loadTasks, loadAudit]);

  // ---- initial load -------------------------------------------------------

  useEffect(() => {
    void safe(refreshAll);
  }, [refreshAll]);

  // ---- selection effects --------------------------------------------------

  useEffect(() => {
    if (!selectedTaskId) {
      setTaskReasons([]);
      return;
    }
    void safe(() => loadTaskReasons(selectedTaskId));
  }, [selectedTaskId, loadTaskReasons]);

  useEffect(() => {
    if (!selectedGoalId) {
      setGoalReasons([]);
      return;
    }
    void safe(() => loadGoalReasons(selectedGoalId));
  }, [selectedGoalId, loadGoalReasons]);

  // ---- debounced search ---------------------------------------------------

  useEffect(() => {
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      void safe(() => loadTasks({ goalId: filterGoalId, status: filterStatus, query: filterSearch }));
    }, 300);
    return () => clearTimeout(searchTimer.current);
  }, [filterSearch, filterGoalId, filterStatus, loadTasks]);

  // ---- task handlers ------------------------------------------------------

  async function handleCreateTask(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    await safe(async () => {
      await createTask({
        title: fd.get("title") as string,
        description: (fd.get("description") as string) || undefined,
        priority: (fd.get("priority") as TaskPriority) || "medium",
        goal_ids: fd.get("goal_id") ? [fd.get("goal_id") as string] : [],
        primary_goal_id: (fd.get("goal_id") as string) || null,
      });
      form.reset();
      await Promise.all([loadTasks({ goalId: filterGoalId, status: filterStatus, query: filterSearch }), loadAudit()]);
    });
  }

  async function handleStatusChange(taskId: string, status: TaskStatus) {
    await safe(async () => {
      await updateTask(taskId, { status });
      await Promise.all([loadTasks({ goalId: filterGoalId, status: filterStatus, query: filterSearch }), loadAudit()]);
    });
  }

  async function handleArchiveTask(taskId: string) {
    await safe(async () => {
      await archiveTask(taskId);
      if (selectedTaskId === taskId) setSelectedTaskId(null);
      await Promise.all([loadTasks({ goalId: filterGoalId, status: filterStatus, query: filterSearch }), loadAudit()]);
    });
  }

  // ---- goal handlers ------------------------------------------------------

  async function handleCreateGoal(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    await safe(async () => {
      await createGoal({
        title: fd.get("title") as string,
        description: (fd.get("description") as string) || undefined,
        goal_type: (fd.get("goal_type") as GoalType) || "path",
        parent_goal_id: (fd.get("parent_goal_id") as string) || null,
      });
      form.reset();
      await Promise.all([loadGoals(), loadAudit()]);
    });
  }

  async function handleArchiveGoal(goalId: string) {
    await safe(async () => {
      await archiveGoal(goalId);
      if (selectedGoalId === goalId) setSelectedGoalId(null);
      await Promise.all([loadGoals(), loadTasks({ goalId: filterGoalId, status: filterStatus, query: filterSearch }), loadAudit()]);
    });
  }

  // ---- reason handlers (task) ---------------------------------------------

  async function handleAddTaskReason(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const text = (fd.get("reason_text") as string)?.trim();
    const taskId = selectedTaskId;
    if (!taskId || !text) return;
    await safe(async () => {
      await createTaskReason(taskId, text);
      form.reset();
      await Promise.all([loadTaskReasons(taskId), loadAudit()]);
    });
  }

  async function handleEditTaskReason(reason: TaskReason) {
    const next = window.prompt("Edit reason", reason.reason_text);
    if (!next?.trim()) return;
    const taskId = selectedTaskId;
    await safe(async () => {
      await updateTaskReason(reason.id, next.trim());
      if (taskId) await loadTaskReasons(taskId);
      await loadAudit();
    });
  }

  async function handleDeleteTaskReason(reason: TaskReason) {
    const taskId = selectedTaskId;
    await safe(async () => {
      await deleteTaskReason(reason.id);
      if (taskId) await loadTaskReasons(taskId);
      await loadAudit();
    });
  }

  // ---- reason handlers (goal) ---------------------------------------------

  async function handleAddGoalReason(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const fd = new FormData(form);
    const text = (fd.get("reason_text") as string)?.trim();
    const goalId = selectedGoalId;
    if (!goalId || !text) return;
    await safe(async () => {
      await createGoalReason(goalId, text);
      form.reset();
      await Promise.all([loadGoalReasons(goalId), loadAudit()]);
    });
  }

  async function handleEditGoalReason(reason: GoalReason) {
    const next = window.prompt("Edit reason", reason.reason_text);
    if (!next?.trim()) return;
    const goalId = selectedGoalId;
    await safe(async () => {
      await updateGoalReason(reason.id, next.trim());
      if (goalId) await loadGoalReasons(goalId);
      await loadAudit();
    });
  }

  async function handleDeleteGoalReason(reason: GoalReason) {
    const goalId = selectedGoalId;
    await safe(async () => {
      await deleteGoalReason(reason.id);
      if (goalId) await loadGoalReasons(goalId);
      await loadAudit();
    });
  }

  // ---- selection toggles --------------------------------------------------

  function toggleTaskSelection(id: string) {
    setSelectedTaskId((prev) => (prev === id ? null : id));
  }

  function toggleGoalSelection(id: string) {
    setSelectedGoalId((prev) => (prev === id ? null : id));
  }

  // ---- render -------------------------------------------------------------

  return (
    <div className="shell">
      <header className="topbar">
        <h1 className="topbar-title">Productivity</h1>
        <nav className="topbar-tabs">
          {(["tasks", "goals", "audit"] as Tab[]).map((t) => (
            <button key={t} className={`tab ${tab === t ? "tab--active" : ""}`} onClick={() => setTab(t)}>
              {t === "tasks" ? "Tasks" : t === "goals" ? "Goals" : "Audit"}
              {t === "tasks" && tasks.length > 0 && <span className="tab-count">{tasks.length}</span>}
              {t === "goals" && goals.length > 0 && <span className="tab-count">{goals.length}</span>}
            </button>
          ))}
        </nav>
      </header>

      {error && (
        <div className="banner banner--error">
          <span>{error}</span>
          <button className="btn btn--ghost btn--sm" onClick={() => setError(null)}>Dismiss</button>
        </div>
      )}

      {/* ================================================================= */}
      {/* TASKS TAB                                                         */}
      {/* ================================================================= */}
      {tab === "tasks" && (
        <div className="page two-col">
          <div className="col-main">
            {/* Filters */}
            <div className="filter-bar">
              <input
                className="input"
                placeholder="Search tasks..."
                value={filterSearch}
                onChange={(e) => setFilterSearch(e.target.value)}
              />
              <select className="input" value={filterGoalId} onChange={(e) => setFilterGoalId(e.target.value)}>
                <option value="">All goals</option>
                {activeGoals.map((g) => (
                  <option key={g.id} value={g.id}>
                    {g.title}
                    {g.is_default ? " (default)" : ""}
                  </option>
                ))}
              </select>
              <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map((s) => (
                  <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                ))}
              </select>
            </div>

            {/* Task list */}
            {tasks.length === 0 ? (
              <div className="empty">No tasks found. Create one below or adjust your filters.</div>
            ) : (
              <ul className="item-list">
                {tasks.map((task) => (
                  <li
                    key={task.id}
                    className={`item ${selectedTaskId === task.id ? "item--selected" : ""}`}
                    onClick={() => toggleTaskSelection(task.id)}
                  >
                    <div className="item-body">
                      <div className="item-row">
                        <strong className="item-title">{task.title}</strong>
                        <span className={`pill pill--priority-${task.priority}`}>
                          {PRIORITY_LABELS[task.priority]}
                        </span>
                      </div>
                      {task.description && <p className="item-desc">{task.description}</p>}
                      <div className="item-meta">
                        <span className={`pill pill--status-${task.status}`}>
                          {STATUS_LABELS[task.status]}
                        </span>
                        <span className="meta-text">
                          {task.goal_ids.map((id) => goalMap.get(id)?.title ?? "Unknown").join(", ")}
                        </span>
                        {task.due_at && <span className="meta-text">Due {formatDate(task.due_at)}</span>}
                      </div>
                    </div>
                    <div className="item-actions" onClick={stopProp}>
                      <select
                        className="input input--sm"
                        value={task.status}
                        onChange={(e) => handleStatusChange(task.id, e.target.value as TaskStatus)}
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s} value={s}>{STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                      {!task.deleted_at && (
                        <button className="btn btn--danger btn--sm" onClick={() => handleArchiveTask(task.id)}>
                          Archive
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Create task form */}
            <div className="card">
              <h3 className="card-title">New Task</h3>
              <form onSubmit={handleCreateTask} className="form-row">
                <input className="input" name="title" placeholder="Task title" required />
                <input className="input" name="description" placeholder="Description (optional)" />
                <select className="input" name="goal_id">
                  <option value="">Default goal</option>
                  {activeGoals.map((g) => (
                    <option key={g.id} value={g.id}>
                      {g.title}
                      {g.is_default ? " (default)" : ""}
                    </option>
                  ))}
                </select>
                <select className="input" name="priority" defaultValue="medium">
                  {PRIORITY_OPTIONS.map((p) => (
                    <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>
                  ))}
                </select>
                <button className="btn" type="submit">Create</button>
              </form>
            </div>
          </div>

          {/* Task detail / reasons panel */}
          <aside className="col-side">
            <div className="card">
              {selectedTask ? (
                <>
                  <h3 className="card-title">{selectedTask.title}</h3>
                  {selectedTask.description && <p className="card-desc">{selectedTask.description}</p>}
                  <div className="detail-meta">
                    <span className={`pill pill--status-${selectedTask.status}`}>
                      {STATUS_LABELS[selectedTask.status]}
                    </span>
                    <span className={`pill pill--priority-${selectedTask.priority}`}>
                      {PRIORITY_LABELS[selectedTask.priority]}
                    </span>
                  </div>
                  <div className="detail-meta">
                    <span className="meta-text">
                      Goals: {selectedTask.goal_ids.map((id) => goalMap.get(id)?.title ?? "Unknown").join(", ")}
                    </span>
                  </div>
                  {selectedTask.due_at && (
                    <div className="detail-meta">
                      <span className="meta-text">Due: {formatDate(selectedTask.due_at)}</span>
                    </div>
                  )}

                  <h4 className="section-title">Reasons</h4>
                  {taskReasons.length === 0 && <p className="empty-sm">No reasons yet.</p>}
                  <ul className="reason-list">
                    {taskReasons.map((r) => (
                      <li key={r.id} className="reason">
                        <span className="reason-text">{r.reason_text}</span>
                        <div className="reason-actions">
                          <button className="btn btn--ghost btn--sm" onClick={() => handleEditTaskReason(r)}>Edit</button>
                          <button className="btn btn--ghost btn--sm" onClick={() => handleDeleteTaskReason(r)}>Del</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <form onSubmit={handleAddTaskReason} className="form-inline">
                    <input className="input" name="reason_text" placeholder="Why does this matter?" required />
                    <button className="btn btn--sm" type="submit">Add</button>
                  </form>
                </>
              ) : (
                <p className="empty-sm">Select a task to see details and reasons.</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ================================================================= */}
      {/* GOALS TAB                                                         */}
      {/* ================================================================= */}
      {tab === "goals" && (
        <div className="page two-col">
          <div className="col-main">
            {goals.length === 0 ? (
              <div className="empty">No goals found.</div>
            ) : (
              <ul className="item-list">
                {goals.map((goal) => (
                  <li
                    key={goal.id}
                    className={`item ${selectedGoalId === goal.id ? "item--selected" : ""} ${goal.deleted_at ? "item--archived" : ""}`}
                    onClick={() => toggleGoalSelection(goal.id)}
                  >
                    <div className="item-body">
                      <div className="item-row">
                        <strong className="item-title">
                          {goal.title}
                          {goal.is_default && <span className="badge">DEFAULT</span>}
                        </strong>
                        <span className={`pill pill--goal-${goal.goal_type}`}>
                          {GOAL_TYPE_LABELS[goal.goal_type]}
                        </span>
                      </div>
                      {goal.description && <p className="item-desc">{goal.description}</p>}
                      <div className="item-meta">
                        <span className={`pill pill--state-${goal.state}`}>{goal.state}</span>
                        {goal.parent_goal_id && (
                          <span className="meta-text">
                            Parent: {goalMap.get(goal.parent_goal_id)?.title ?? "Unknown"}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="item-actions" onClick={stopProp}>
                      {!goal.is_default && !goal.deleted_at && goal.state !== "archived" && (
                        <button className="btn btn--danger btn--sm" onClick={() => handleArchiveGoal(goal.id)}>
                          Archive
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Create goal form */}
            <div className="card">
              <h3 className="card-title">New Goal</h3>
              <form onSubmit={handleCreateGoal} className="form-row">
                <input className="input" name="title" placeholder="Goal title" required />
                <input className="input" name="description" placeholder="Description (optional)" />
                <select className="input" name="goal_type" defaultValue="path">
                  {GOAL_TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>{GOAL_TYPE_LABELS[t]}</option>
                  ))}
                </select>
                <select className="input" name="parent_goal_id">
                  <option value="">No parent</option>
                  {activeGoals.map((g) => (
                    <option key={g.id} value={g.id}>{g.title}</option>
                  ))}
                </select>
                <button className="btn" type="submit">Create</button>
              </form>
            </div>
          </div>

          {/* Goal detail / reasons panel */}
          <aside className="col-side">
            <div className="card">
              {selectedGoal ? (
                <>
                  <h3 className="card-title">
                    {selectedGoal.title}
                    {selectedGoal.is_default && <span className="badge">DEFAULT</span>}
                  </h3>
                  {selectedGoal.description && <p className="card-desc">{selectedGoal.description}</p>}
                  <div className="detail-meta">
                    <span className={`pill pill--goal-${selectedGoal.goal_type}`}>
                      {GOAL_TYPE_LABELS[selectedGoal.goal_type]}
                    </span>
                    <span className={`pill pill--state-${selectedGoal.state}`}>{selectedGoal.state}</span>
                  </div>

                  <h4 className="section-title">Reasons</h4>
                  {goalReasons.length === 0 && <p className="empty-sm">No reasons yet.</p>}
                  <ul className="reason-list">
                    {goalReasons.map((r) => (
                      <li key={r.id} className="reason">
                        <span className="reason-text">{r.reason_text}</span>
                        <div className="reason-actions">
                          <button className="btn btn--ghost btn--sm" onClick={() => handleEditGoalReason(r)}>Edit</button>
                          <button className="btn btn--ghost btn--sm" onClick={() => handleDeleteGoalReason(r)}>Del</button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <form onSubmit={handleAddGoalReason} className="form-inline">
                    <input className="input" name="reason_text" placeholder="Why does this goal matter?" required />
                    <button className="btn btn--sm" type="submit">Add</button>
                  </form>
                </>
              ) : (
                <p className="empty-sm">Select a goal to see details and reasons.</p>
              )}
            </div>
          </aside>
        </div>
      )}

      {/* ================================================================= */}
      {/* AUDIT TAB                                                         */}
      {/* ================================================================= */}
      {tab === "audit" && (
        <div className="page">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title">Audit Log</h3>
              <button className="btn btn--sm" onClick={() => safe(loadAudit)}>Refresh</button>
            </div>
            {audit.length === 0 ? (
              <div className="empty">No audit events recorded yet.</div>
            ) : (
              <ul className="audit-list">
                {audit.map((ev) => (
                  <li key={ev.id} className="audit-item">
                    <span className="audit-action">{ev.action}</span>
                    <span className="audit-actor">{ev.actor_type}:{ev.actor_id}</span>
                    <span className="audit-entity">{ev.entity_type}:{ev.entity_id ?? "-"}</span>
                    <span className="audit-time">{formatDate(ev.created_at)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
