import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type {
  BlockCreate,
  BlockListParams,
  BlockUpdate,
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
  blocks: (params?: BlockListParams) => ["blocks", params ?? {}] as const,
  block: (id: string) => ["blocks", id] as const,
  blockReasons: (blockId: string) => ["blocks", blockId, "reasons"] as const,
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

// ── Block hooks ─────────────────────────────────────────────────────────────

export function useBlocks(params?: BlockListParams) {
  return useQuery({
    queryKey: queryKeys.blocks(params),
    queryFn: () => api.listBlocks(params),
  });
}

export function useBlock(id: string | undefined) {
  return useQuery({
    queryKey: queryKeys.block(id!),
    queryFn: () => api.getBlock(id!),
    enabled: !!id,
  });
}

export function useCreateBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: BlockCreate) => api.createBlock(data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blocks"] });
    },
  });
}

export function useUpdateBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: BlockUpdate }) => api.updateBlock(id, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: ["blocks"] });
      qc.invalidateQueries({ queryKey: queryKeys.block(vars.id) });
    },
  });
}

export function useArchiveBlock() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.archiveBlock(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["blocks"] });
    },
  });
}

export function useLinkBlockDrivers() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, data }: { blockId: string; data: LinkDriversRequest }) =>
      api.linkBlockDrivers(blockId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.block(vars.blockId) });
    },
  });
}

export function useUnlinkBlockDriver() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, driverId }: { blockId: string; driverId: string }) =>
      api.unlinkBlockDriver(blockId, driverId),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.block(vars.blockId) });
    },
  });
}

// ── Block reason hooks ──────────────────────────────────────────────────────

export function useBlockReasons(blockId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.blockReasons(blockId!),
    queryFn: () => api.listBlockReasons(blockId!),
    enabled: !!blockId,
  });
}

export function useAddBlockReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ blockId, data }: { blockId: string; data: ReasonCreate }) =>
      api.addBlockReason(blockId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.blockReasons(vars.blockId) });
    },
  });
}

export function useUpdateBlockReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      reasonId,
      blockId,
      data,
    }: {
      reasonId: string;
      blockId: string;
      data: ReasonUpdate;
    }) => api.updateBlockReason(reasonId, data),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.blockReasons(vars.blockId) });
    },
  });
}

export function useDeleteBlockReason() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ reasonId, blockId }: { reasonId: string; blockId: string }) =>
      api.deleteBlockReason(reasonId),
    onSuccess: (_result, vars) => {
      qc.invalidateQueries({ queryKey: queryKeys.blockReasons(vars.blockId) });
    },
  });
}
