import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  ScheduleCreate,
  ScheduleListParams,
  ScheduleUpdate,
  DriverCreate,
  DriverListParams,
  DriverUpdate,
  InitiativeCreate,
  InitiativeListParams,
  InitiativeUpdate,
  LinkDriversRequest,
  ReasonCreate,
  ReasonUpdate,
  TaskCreate,
  TaskListParams,
  TaskUpdate,
} from "./types";

// ── Query keys ──────────────────────────────────────────────────────────────

export const queryKeys = {
  tasks: (params?: TaskListParams) => ["tasks", params ?? {}] as const,
  task: (id: string) => ["tasks", id] as const,
  taskReasons: (taskId: string) => ["tasks", taskId, "reasons"] as const,
  initiatives: (params?: InitiativeListParams) => ["initiatives", params ?? {}] as const,
  initiative: (id: string) => ["initiatives", id] as const,
  initiativeReasons: (initiativeId: string) => ["initiatives", initiativeId, "reasons"] as const,
  drivers: (params?: DriverListParams) => ["drivers", params ?? {}] as const,
  driver: (id: string) => ["drivers", id] as const,
  driversTree: () => ["drivers", "tree"] as const,
  schedules: (params?: ScheduleListParams) => ["schedules", params ?? {}] as const,
  schedule: (id: string) => ["schedules", id] as const,
  scheduleReasons: (scheduleId: string) => ["schedules", scheduleId, "reasons"] as const,
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

export function useLinkTaskDrivers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, data }: { taskId: string; data: LinkDriversRequest }) =>
      api.linkTaskDrivers(taskId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.task(vars.taskId) });
    },
  });
}

export function useUnlinkTaskDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, driverId }: { taskId: string; driverId: string }) =>
      api.unlinkTaskDriver(taskId, driverId),
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

// ── Initiative hooks ────────────────────────────────────────────────────────

export function useInitiatives(params?: InitiativeListParams) {
  return useQuery({
    queryKey: queryKeys.initiatives(params),
    queryFn: () => api.listInitiatives(params),
  });
}

export function useInitiative(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.initiative(id!),
    queryFn: () => api.getInitiative(id!),
    enabled: !!id,
  });
}

export function useCreateInitiative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: InitiativeCreate) => api.createInitiative(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["initiatives"] });
    },
  });
}

export function useUpdateInitiative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: InitiativeUpdate }) => api.updateInitiative(id, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ["initiatives"] });
      qc.invalidateQueries({ queryKey: queryKeys.initiative(vars.id) });
    },
  });
}

export function useArchiveInitiative() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveInitiative(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["initiatives"] });
    },
  });
}

export function useLinkInitiativeDrivers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ initiativeId, data }: { initiativeId: string; data: LinkDriversRequest }) =>
      api.linkInitiativeDrivers(initiativeId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.initiative(vars.initiativeId) });
    },
  });
}

export function useUnlinkInitiativeDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ initiativeId, driverId }: { initiativeId: string; driverId: string }) =>
      api.unlinkInitiativeDriver(initiativeId, driverId),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.initiative(vars.initiativeId) });
    },
  });
}

// ── Initiative reason hooks ────────────────────────────────────────────────

export function useInitiativeReasons(initiativeId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.initiativeReasons(initiativeId!),
    queryFn: () => api.listInitiativeReasons(initiativeId!),
    enabled: !!initiativeId,
  });
}

export function useAddInitiativeReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ initiativeId, data }: { initiativeId: string; data: ReasonCreate }) =>
      api.addInitiativeReason(initiativeId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.initiativeReasons(vars.initiativeId) });
    },
  });
}

export function useUpdateInitiativeReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reasonId,
      initiativeId,
      data,
    }: {
      reasonId: string;
      initiativeId: string;
      data: ReasonUpdate;
    }) => api.updateInitiativeReason(reasonId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.initiativeReasons(vars.initiativeId) });
    },
  });
}

export function useDeleteInitiativeReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reasonId, initiativeId }: { reasonId: string; initiativeId: string }) =>
      api.deleteInitiativeReason(reasonId),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.initiativeReasons(vars.initiativeId) });
    },
  });
}

// ── Driver hooks ────────────────────────────────────────────────────────────

export function useDrivers(params?: DriverListParams) {
  return useQuery({
    queryKey: queryKeys.drivers(params),
    queryFn: () => api.listDrivers(params),
  });
}

export function useDriver(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.driver(id!),
    queryFn: () => api.getDriver(id!),
    enabled: !!id,
  });
}

export function useDriversTree() {
  return useQuery({
    queryKey: queryKeys.driversTree(),
    queryFn: () => api.getDriversTree(),
  });
}

export function useCreateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: DriverCreate) => api.createDriver(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
    },
  });
}

export function useUpdateDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: DriverUpdate }) => api.updateDriver(id, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
      qc.invalidateQueries({ queryKey: queryKeys.driver(vars.id) });
    },
  });
}

export function useArchiveDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveDriver(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["drivers"] });
    },
  });
}

// ── Schedule hooks ───────────────────────────────────────────────────────

export function useSchedules(params?: ScheduleListParams) {
  return useQuery({
    queryKey: queryKeys.schedules(params),
    queryFn: () => api.listSchedules(params),
  });
}

export function useSchedule(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.schedule(id!),
    queryFn: () => api.getSchedule(id!),
    enabled: !!id,
  });
}

export function useCreateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: ScheduleCreate) => api.createSchedule(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useUpdateSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: ScheduleUpdate }) => api.updateSchedule(id, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
      qc.invalidateQueries({ queryKey: queryKeys.schedule(vars.id) });
    },
  });
}

export function useArchiveSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveSchedule(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["schedules"] });
    },
  });
}

export function useLinkScheduleDrivers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, data }: { scheduleId: string; data: LinkDriversRequest }) =>
      api.linkScheduleDrivers(scheduleId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.schedule(vars.scheduleId) });
    },
  });
}

export function useUnlinkScheduleDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, driverId }: { scheduleId: string; driverId: string }) =>
      api.unlinkScheduleDriver(scheduleId, driverId),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.schedule(vars.scheduleId) });
    },
  });
}

// ── Schedule reason hooks ────────────────────────────────────────────────

export function useScheduleReasons(scheduleId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.scheduleReasons(scheduleId!),
    queryFn: () => api.listScheduleReasons(scheduleId!),
    enabled: !!scheduleId,
  });
}

export function useAddScheduleReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ scheduleId, data }: { scheduleId: string; data: ReasonCreate }) =>
      api.addScheduleReason(scheduleId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.scheduleReasons(vars.scheduleId) });
    },
  });
}

export function useUpdateScheduleReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reasonId,
      scheduleId,
      data,
    }: {
      reasonId: string;
      scheduleId: string;
      data: ReasonUpdate;
    }) => api.updateScheduleReason(reasonId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.scheduleReasons(vars.scheduleId) });
    },
  });
}

export function useDeleteScheduleReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reasonId, scheduleId }: { reasonId: string; scheduleId: string }) =>
      api.deleteScheduleReason(reasonId),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.scheduleReasons(vars.scheduleId) });
    },
  });
}
