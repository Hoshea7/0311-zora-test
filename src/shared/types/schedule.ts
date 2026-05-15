export type ScheduledTaskStatus = "active" | "paused";

export const SCHEDULE_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

export function isValidScheduleTime(value: string): boolean {
  return SCHEDULE_TIME_PATTERN.test(value);
}

export function normalizeScheduleWeekdays(weekdays: readonly number[]): number[] {
  return [...new Set(weekdays)]
    .filter((weekday) => Number.isInteger(weekday) && weekday >= 1 && weekday <= 7)
    .sort((a, b) => a - b);
}

export function isValidScheduleWeekdays(value: unknown): value is number[] {
  if (!Array.isArray(value) || value.length === 0) {
    return false;
  }

  const normalized = normalizeScheduleWeekdays(value);
  return normalized.length === value.length;
}

export type ScheduledTaskSchedule =
  | {
      type: "once";
      runAt: string;
    }
  | {
      type: "hourly";
    }
  | {
      type: "daily";
      time: string;
    }
  | {
      type: "weekdays";
      time: string;
    }
  | {
      type: "weekly";
      weekdays: number[];
      time: string;
    };

export interface ScheduledTask {
  id: string;
  workspaceId: string;
  title: string;
  executionPrompt: string;
  status: ScheduledTaskStatus;
  schedule: ScheduledTaskSchedule;
  nextRunAt: string;
  createdAt: string;
  updatedAt: string;
  runCount: number;
  failureCount: number;
}

export interface ScheduledTaskCreateInput {
  workspaceId: string;
  title: string;
  executionPrompt: string;
  schedule: ScheduledTaskSchedule;
}

export interface ScheduledTaskUpdateInput {
  taskId: string;
  workspaceId: string;
  updates: Partial<
    Pick<
      ScheduledTask,
      "workspaceId" | "title" | "executionPrompt" | "status" | "schedule"
    >
  >;
}

export interface ScheduledTaskDetailLink {
  type: "zora-schedule-task";
  workspaceId: string;
  taskId: string;
  label: string;
}
