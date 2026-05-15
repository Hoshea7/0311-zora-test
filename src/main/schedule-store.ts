import { randomUUID } from "node:crypto";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  ScheduledTask,
  ScheduledTaskCreateInput,
  ScheduledTaskSchedule,
  ScheduledTaskStatus,
  ScheduledTaskUpdateInput,
} from "../shared/types/schedule";
import {
  isValidScheduleTime,
  isValidScheduleWeekdays,
  normalizeScheduleWeekdays,
} from "../shared/types/schedule";
import { isEnoentError, replaceFileAtomically, ZORA_DIR } from "./utils/fs";
import { isRecord } from "./utils/guards";
import { listWorkspaces } from "./workspace-store";

const changeListeners = new Set<(workspaceId: string) => void>();
const workspaceWriteLocks = new Map<string, Promise<void>>();

function emitChanged(workspaceId: string): void {
  for (const listener of changeListeners) {
    listener(workspaceId);
  }
}

export function onScheduledTasksStoreChanged(
  listener: (workspaceId: string) => void
): () => void {
  changeListeners.add(listener);

  return () => {
    changeListeners.delete(listener);
  };
}

function getSchedulesDir(workspaceId = "default"): string {
  return path.join(ZORA_DIR, "workspaces", workspaceId, "schedules");
}

function getTasksFile(workspaceId = "default"): string {
  return path.join(getSchedulesDir(workspaceId), "tasks.json");
}

function isTaskStatus(value: unknown): value is ScheduledTaskStatus {
  return value === "active" || value === "paused";
}

function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0;
}

function isSchedule(value: unknown): value is ScheduledTaskSchedule {
  if (!isRecord(value) || typeof value.type !== "string") {
    return false;
  }

  if (value.type === "once") {
    return typeof value.runAt === "string" && !Number.isNaN(new Date(value.runAt).getTime());
  }

  if (value.type === "daily") {
    return typeof value.time === "string" && isValidScheduleTime(value.time);
  }

  if (value.type === "hourly") {
    return true;
  }

  if (value.type === "weekdays") {
    return typeof value.time === "string" && isValidScheduleTime(value.time);
  }

  if (value.type === "weekly") {
    return (
      typeof value.time === "string" &&
      isValidScheduleTime(value.time) &&
      isValidScheduleWeekdays(value.weekdays)
    );
  }

  return false;
}

function normalizeStoredTask(value: unknown): ScheduledTask | null {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.workspaceId !== "string" ||
    typeof value.title !== "string" ||
    typeof value.executionPrompt !== "string" ||
    !isTaskStatus(value.status) ||
    !isSchedule(value.schedule) ||
    typeof value.nextRunAt !== "string" ||
    Number.isNaN(new Date(value.nextRunAt).getTime()) ||
    typeof value.createdAt !== "string" ||
    Number.isNaN(new Date(value.createdAt).getTime()) ||
    typeof value.updatedAt !== "string" ||
    Number.isNaN(new Date(value.updatedAt).getTime()) ||
    !isNonNegativeInteger(value.runCount) ||
    !isNonNegativeInteger(value.failureCount)
  ) {
    return null;
  }

  return {
    id: value.id,
    workspaceId: value.workspaceId,
    title: value.title,
    executionPrompt: value.executionPrompt,
    status: value.status,
    schedule: value.schedule,
    nextRunAt: value.nextRunAt,
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
    runCount: value.runCount,
    failureCount: value.failureCount,
  };
}

async function ensureSchedulesDir(workspaceId = "default"): Promise<void> {
  await mkdir(getSchedulesDir(workspaceId), { recursive: true });
}

function compareTasksByNextRunAt(a: ScheduledTask, b: ScheduledTask): number {
  const nextRunDelta = new Date(a.nextRunAt).getTime() - new Date(b.nextRunAt).getTime();

  if (nextRunDelta !== 0) {
    return nextRunDelta;
  }

  return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
}

async function readTasks(workspaceId = "default"): Promise<ScheduledTask[]> {
  try {
    const raw = await readFile(getTasksFile(workspaceId), "utf8");
    const parsed = JSON.parse(raw) as unknown;

    if (!Array.isArray(parsed)) {
      throw new Error("tasks.json root must be an array.");
    }

    const normalizedTasks: ScheduledTask[] = [];
    const invalidIndex = parsed.findIndex((item) => {
      const task = normalizeStoredTask(item);
      if (!task) {
        return true;
      }

      normalizedTasks.push(task);
      return false;
    });
    if (invalidIndex !== -1) {
      throw new Error(`tasks.json contains an invalid task at index ${invalidIndex}.`);
    }

    return normalizedTasks;
  } catch (error) {
    if (isEnoentError(error)) {
      return [];
    }

    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`读取定时任务失败：${message}`);
  }
}

async function writeTasks(workspaceId: string, tasks: ScheduledTask[]): Promise<void> {
  await ensureSchedulesDir(workspaceId);
  await replaceFileAtomically(
    getTasksFile(workspaceId),
    JSON.stringify([...tasks].sort(compareTasksByNextRunAt), null, 2)
  );
}

function normalizeText(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!trimmed) {
    throw new Error(`${fieldName} is required.`);
  }

  return trimmed;
}

function getIsoWeekday(date: Date): number {
  const day = date.getDay();
  return day === 0 ? 7 : day;
}

function normalizeWeekdays(weekdays: number[]): number[] {
  const unique = normalizeScheduleWeekdays(weekdays);

  if (!isValidScheduleWeekdays(unique)) {
    throw new Error("schedule.weekdays must contain unique values from 1 to 7.");
  }

  return unique;
}

function calculateNextRunAt(schedule: ScheduledTaskSchedule, now = new Date()): string {
  if (schedule.type === "once") {
    const runAt = new Date(schedule.runAt);

    if (Number.isNaN(runAt.getTime())) {
      throw new Error("schedule.runAt must be a valid date.");
    }

    if (runAt.getTime() <= now.getTime()) {
      throw new Error("一次性任务时间必须晚于当前时间。");
    }

    return runAt.toISOString();
  }

  if (schedule.type === "daily") {
    if (!isValidScheduleTime(schedule.time)) {
      throw new Error("schedule.time must use HH:mm format.");
    }

    const [hour, minute] = schedule.time.split(":").map(Number);
    const candidate = new Date(now);
    candidate.setHours(hour, minute, 0, 0);

    if (candidate.getTime() <= now.getTime()) {
      candidate.setDate(candidate.getDate() + 1);
    }

    return candidate.toISOString();
  }

  if (schedule.type === "hourly") {
    const candidate = new Date(now);
    candidate.setSeconds(0, 0);
    candidate.setHours(candidate.getHours() + 1);
    return candidate.toISOString();
  }

  if (schedule.type === "weekdays") {
    if (!isValidScheduleTime(schedule.time)) {
      throw new Error("schedule.time must use HH:mm format.");
    }

    const [hour, minute] = schedule.time.split(":").map(Number);

    for (let offset = 0; offset <= 7; offset += 1) {
      const candidate = new Date(now);
      candidate.setDate(now.getDate() + offset);
      candidate.setHours(hour, minute, 0, 0);

      const weekday = getIsoWeekday(candidate);
      if (weekday >= 1 && weekday <= 5 && candidate.getTime() > now.getTime()) {
        return candidate.toISOString();
      }
    }

    throw new Error("Unable to calculate next weekday run time.");
  }

  if (!isValidScheduleTime(schedule.time)) {
    throw new Error("schedule.time must use HH:mm format.");
  }

  const [hour, minute] = schedule.time.split(":").map(Number);
  const weekdays = normalizeWeekdays(schedule.weekdays);

  for (let offset = 0; offset <= 7; offset += 1) {
    const candidate = new Date(now);
    candidate.setDate(now.getDate() + offset);
    candidate.setHours(hour, minute, 0, 0);

    if (weekdays.includes(getIsoWeekday(candidate)) && candidate.getTime() > now.getTime()) {
      return candidate.toISOString();
    }
  }

  throw new Error("Unable to calculate next weekly run time.");
}

function normalizeSchedule(schedule: ScheduledTaskSchedule): ScheduledTaskSchedule {
  if (schedule.type === "once") {
    return {
      type: "once",
      runAt: calculateNextRunAt(schedule),
    };
  }

  if (schedule.type === "daily") {
    if (!isValidScheduleTime(schedule.time)) {
      throw new Error("schedule.time must use HH:mm format.");
    }

    return {
      type: "daily",
      time: schedule.time,
    };
  }

  if (schedule.type === "hourly") {
    return {
      type: "hourly",
    };
  }

  if (schedule.type === "weekdays") {
    if (!isValidScheduleTime(schedule.time)) {
      throw new Error("schedule.time must use HH:mm format.");
    }

    return {
      type: "weekdays",
      time: schedule.time,
    };
  }

  return {
    type: "weekly",
    time: schedule.time,
    weekdays: normalizeWeekdays(schedule.weekdays),
  };
}

async function withWorkspaceWriteLock<T>(
  workspaceId: string,
  operation: () => Promise<T>
): Promise<T> {
  const previous = workspaceWriteLocks.get(workspaceId) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => {
    release = resolve;
  });
  const chained = previous.catch(() => undefined).then(() => current);
  workspaceWriteLocks.set(workspaceId, chained);

  await previous.catch(() => undefined);

  try {
    return await operation();
  } finally {
    release();
    if (workspaceWriteLocks.get(workspaceId) === chained) {
      workspaceWriteLocks.delete(workspaceId);
    }
  }
}

async function withWorkspaceWriteLocks<T>(
  workspaceIds: string[],
  operation: () => Promise<T>
): Promise<T> {
  const uniqueWorkspaceIds = [...new Set(workspaceIds)].sort();

  const runAtIndex = (index: number): Promise<T> => {
    if (index >= uniqueWorkspaceIds.length) {
      return operation();
    }

    return withWorkspaceWriteLock(uniqueWorkspaceIds[index], () =>
      runAtIndex(index + 1)
    );
  };

  return runAtIndex(0);
}

export async function listScheduledTasks(workspaceId = "default"): Promise<ScheduledTask[]> {
  const tasks = await readTasks(workspaceId);

  return tasks.sort(compareTasksByNextRunAt);
}

export async function listAllScheduledTasks(): Promise<ScheduledTask[]> {
  const workspaces = await listWorkspaces();
  const taskGroups = await Promise.all(
    workspaces.map((workspace) => listScheduledTasks(workspace.id))
  );

  return taskGroups.flat().sort(compareTasksByNextRunAt);
}

export async function getScheduledTask(
  taskId: string,
  workspaceId = "default"
): Promise<ScheduledTask | null> {
  const tasks = await readTasks(workspaceId);
  return tasks.find((task) => task.id === taskId) ?? null;
}

export async function createScheduledTask(
  input: ScheduledTaskCreateInput
): Promise<ScheduledTask> {
  const workspaceId = normalizeText(input.workspaceId, "workspaceId");
  const schedule = normalizeSchedule(input.schedule);
  const nextRunAt =
    schedule.type === "once" ? schedule.runAt : calculateNextRunAt(schedule);
  const now = new Date().toISOString();
  const task: ScheduledTask = {
    id: randomUUID(),
    workspaceId,
    title: normalizeText(input.title, "title"),
    executionPrompt: normalizeText(input.executionPrompt, "executionPrompt"),
    status: "active",
    schedule,
    nextRunAt,
    createdAt: now,
    updatedAt: now,
    runCount: 0,
    failureCount: 0,
  };

  await withWorkspaceWriteLock(workspaceId, async () => {
    const tasks = await readTasks(workspaceId);
    await writeTasks(workspaceId, [task, ...tasks]);
  });
  emitChanged(workspaceId);

  return task;
}

export async function updateScheduledTask(
  input: ScheduledTaskUpdateInput
): Promise<ScheduledTask> {
  const workspaceId = normalizeText(input.workspaceId, "workspaceId");
  const targetWorkspaceId =
    input.updates.workspaceId !== undefined
      ? normalizeText(input.updates.workspaceId, "updates.workspaceId")
      : workspaceId;
  const taskId = normalizeText(input.taskId, "taskId");
  const changedWorkspaceIds = new Set<string>([workspaceId]);
  const nextTask = await withWorkspaceWriteLocks(
    [workspaceId, targetWorkspaceId],
    async () => {
      const tasks = await readTasks(workspaceId);
      const index = tasks.findIndex((task) => task.id === taskId);

      if (index === -1) {
        throw new Error("Scheduled task not found.");
      }

      const current = tasks[index];
      const targetTasks =
        targetWorkspaceId === workspaceId ? tasks : await readTasks(targetWorkspaceId);

      if (
        targetWorkspaceId !== workspaceId &&
        targetTasks.some((task) => task.id === taskId)
      ) {
        throw new Error("目标工作区已有相同 id 的定时任务。");
      }

      const updates = input.updates;
      const schedule =
        updates.schedule !== undefined
          ? normalizeSchedule(updates.schedule)
          : current.schedule;
      const scheduleChanged = updates.schedule !== undefined;
      const nextRunAt = scheduleChanged
        ? schedule.type === "once"
          ? schedule.runAt
          : calculateNextRunAt(schedule)
        : current.nextRunAt;

      const task: ScheduledTask = {
        ...current,
        workspaceId: targetWorkspaceId,
        title:
          updates.title !== undefined
            ? normalizeText(updates.title, "title")
            : current.title,
        executionPrompt:
          updates.executionPrompt !== undefined
            ? normalizeText(updates.executionPrompt, "executionPrompt")
            : current.executionPrompt,
        status: updates.status ?? current.status,
        schedule,
        nextRunAt,
        updatedAt: new Date().toISOString(),
      };

      if (targetWorkspaceId === workspaceId) {
        tasks[index] = task;
        await writeTasks(workspaceId, tasks);
      } else {
        tasks.splice(index, 1);
        await writeTasks(workspaceId, tasks);
        await writeTasks(targetWorkspaceId, [task, ...targetTasks]);
        changedWorkspaceIds.add(targetWorkspaceId);
      }

      return task;
    }
  );

  for (const changedWorkspaceId of changedWorkspaceIds) {
    emitChanged(changedWorkspaceId);
  }

  return nextTask;
}

export async function claimDueScheduledTask(
  taskId: string,
  workspaceId = "default",
  now = new Date()
): Promise<ScheduledTask | null> {
  const claimedTask = await withWorkspaceWriteLock(workspaceId, async () => {
    const tasks = await readTasks(workspaceId);
    const index = tasks.findIndex((task) => task.id === taskId);

    if (index === -1) {
      return null;
    }

    const current = tasks[index];
    if (
      current.status !== "active" ||
      new Date(current.nextRunAt).getTime() > now.getTime()
    ) {
      return null;
    }

    const nextTask: ScheduledTask = {
      ...current,
      status: current.schedule.type === "once" ? "paused" : current.status,
      nextRunAt:
        current.schedule.type === "once"
          ? current.nextRunAt
          : calculateNextRunAt(current.schedule, now),
      updatedAt: now.toISOString(),
    };

    tasks[index] = nextTask;
    await writeTasks(workspaceId, tasks);
    return current;
  });

  if (claimedTask) {
    emitChanged(workspaceId);
  }

  return claimedTask;
}

export async function recordScheduledTaskRun(
  taskId: string,
  workspaceId = "default",
  result: { success: boolean }
): Promise<ScheduledTask | null> {
  const updatedTask = await withWorkspaceWriteLock(workspaceId, async () => {
    const tasks = await readTasks(workspaceId);
    const index = tasks.findIndex((task) => task.id === taskId);

    if (index === -1) {
      return null;
    }

    const current = tasks[index];
    const task: ScheduledTask = {
      ...current,
      runCount: current.runCount + 1,
      failureCount: result.success
        ? current.failureCount
        : current.failureCount + 1,
      updatedAt: new Date().toISOString(),
    };

    tasks[index] = task;
    await writeTasks(workspaceId, tasks);
    return task;
  });

  if (updatedTask) {
    emitChanged(workspaceId);
  }

  return updatedTask;
}

export async function deleteScheduledTask(
  taskId: string,
  workspaceId = "default"
): Promise<void> {
  await withWorkspaceWriteLock(workspaceId, async () => {
    const tasks = await readTasks(workspaceId);
    const index = tasks.findIndex((task) => task.id === taskId);

    if (index === -1) {
      throw new Error("找不到要删除的定时任务。");
    }

    tasks.splice(index, 1);
    await writeTasks(workspaceId, tasks);
  });

  emitChanged(workspaceId);
}
