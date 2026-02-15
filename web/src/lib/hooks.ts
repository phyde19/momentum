import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  GoalCreate,
  GoalListParams,
  GoalUpdate,
  LinkGoalsRequest,
  ReasonCreate,
  ReasonUpdate,
  Task,
  TaskCreate,
  TaskListParams,
  TaskUpdate,
} from "./types";

// ── Query keys ──────────────────────────────────────────────────────────────

export const queryKeys = {
  tasks: (params?: TaskListParams) => ["tasks", params ?? {}] as const,
  task: (id: string) => ["tasks", id] as const,
  taskReasons: (taskId: string) => ["tasks", taskId, "reasons"] as const,
  goals: (params?: GoalListParams) => ["goals", params ?? {}] as const,
  goal: (id: string) => ["goals", id] as const,
  goalReasons: (goalId: string) => ["goals", goalId, "reasons"] as const,
};

// ── Task hooks ──────────────────────────────────────────────────────────────

export function useTasks(params?: TaskListParams) {
  return useQuery({
    queryKey: queryKeys.tasks(params),
    queryFn: () => api.listTasks(params),
  });
}

export function useTask(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.task(id!),
    queryFn: () => api.getTask(id!),
    enabled: !!id,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: TaskCreate) => api.createTask(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskUpdate }) => api.updateTask(id, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      qc.invalidateQueries({ queryKey: queryKeys.task(vars.id) });
    },
  });
}

export function useArchiveTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveTask(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
    },
  });
}

export function useLinkTaskGoals() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: LinkGoalsRequest }) =>
      api.linkTaskGoals(taskId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.task(vars.taskId) });
    },
  });
}

export function useUnlinkTaskGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, goalId }: { taskId: string; goalId: string }) =>
      api.unlinkTaskGoal(taskId, goalId),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.task(vars.taskId) });
    },
  });
}

// ── Task reason hooks ───────────────────────────────────────────────────────

export function useTaskReasons(taskId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.taskReasons(taskId!),
    queryFn: () => api.listTaskReasons(taskId!),
    enabled: !!taskId,
  });
}

export function useAddTaskReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: ReasonCreate }) =>
      api.addTaskReason(taskId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.taskReasons(vars.taskId) });
    },
  });
}

export function useUpdateTaskReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reasonId,
      taskId,
      data,
    }: {
      reasonId: string;
      taskId: string;
      data: ReasonUpdate;
    }) => api.updateTaskReason(reasonId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.taskReasons(vars.taskId) });
    },
  });
}

export function useDeleteTaskReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reasonId, taskId }: { reasonId: string; taskId: string }) =>
      api.deleteTaskReason(reasonId),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.taskReasons(vars.taskId) });
    },
  });
}

// ── Goal hooks ──────────────────────────────────────────────────────────────

export function useGoals(params?: GoalListParams) {
  return useQuery({
    queryKey: queryKeys.goals(params),
    queryFn: () => api.listGoals(params),
  });
}

export function useGoal(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.goal(id!),
    queryFn: () => api.getGoal(id!),
    enabled: !!id,
  });
}

export function useCreateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: GoalCreate) => api.createGoal(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

export function useUpdateGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: GoalUpdate }) => api.updateGoal(id, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ["goals"] });
      qc.invalidateQueries({ queryKey: queryKeys.goal(vars.id) });
    },
  });
}

export function useArchiveGoal() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveGoal(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["goals"] });
    },
  });
}

// ── Goal reason hooks ───────────────────────────────────────────────────────

export function useGoalReasons(goalId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.goalReasons(goalId!),
    queryFn: () => api.listGoalReasons(goalId!),
    enabled: !!goalId,
  });
}

export function useAddGoalReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ goalId, data }: { goalId: string; data: ReasonCreate }) =>
      api.addGoalReason(goalId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.goalReasons(vars.goalId) });
    },
  });
}

export function useUpdateGoalReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reasonId,
      goalId,
      data,
    }: {
      reasonId: string;
      goalId: string;
      data: ReasonUpdate;
    }) => api.updateGoalReason(reasonId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.goalReasons(vars.goalId) });
    },
  });
}

export function useDeleteGoalReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reasonId, goalId }: { reasonId: string; goalId: string }) =>
      api.deleteGoalReason(reasonId),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.goalReasons(vars.goalId) });
    },
  });
}
