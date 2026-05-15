import { atom } from "jotai";
import type {
  ScheduledTask,
  ScheduledTaskStatus,
  ScheduledTaskUpdateInput,
} from "../../shared/types/schedule";
import { getErrorMessage } from "../utils/message";

export interface ScheduledTaskSelection {
  taskId: string;
  workspaceId: string;
}

function toSelection(task: ScheduledTask): ScheduledTaskSelection {
  return {
    taskId: task.id,
    workspaceId: task.workspaceId,
  };
}

function matchesSelection(
  task: ScheduledTask,
  selection: ScheduledTaskSelection
): boolean {
  return task.id === selection.taskId && task.workspaceId === selection.workspaceId;
}

export const scheduledTasksAtom = atom<ScheduledTask[]>([]);
export const selectedScheduledTaskSelectionAtom = atom<ScheduledTaskSelection | null>(null);
export const scheduledTasksLoadingAtom = atom(false);
export const scheduledTasksErrorAtom = atom<string | null>(null);
const scheduledTasksLoadRequestIdAtom = atom(0);

export const selectedScheduledTaskAtom = atom((get) => {
  const selection = get(selectedScheduledTaskSelectionAtom);

  if (!selection) {
    return null;
  }

  return (
    get(scheduledTasksAtom).find((task) => matchesSelection(task, selection)) ?? null
  );
});

export const loadScheduledTasksAtom = atom(
  null,
  async (get, set, workspaceId?: string) => {
    const requestId = get(scheduledTasksLoadRequestIdAtom) + 1;
    set(scheduledTasksLoadRequestIdAtom, requestId);
    set(scheduledTasksLoadingAtom, true);
    set(scheduledTasksErrorAtom, null);

    try {
      const tasks = await window.zora.listScheduledTasks(workspaceId);

      if (get(scheduledTasksLoadRequestIdAtom) !== requestId) {
        return tasks;
      }

      set(scheduledTasksAtom, tasks);
      set(selectedScheduledTaskSelectionAtom, (current) => {
        if (current && tasks.some((task) => matchesSelection(task, current))) {
          return current;
        }

        return tasks[0] ? toSelection(tasks[0]) : null;
      });

      return tasks;
    } catch (error) {
      if (get(scheduledTasksLoadRequestIdAtom) === requestId) {
        set(scheduledTasksErrorAtom, getErrorMessage(error));
      }
      return [];
    } finally {
      if (get(scheduledTasksLoadRequestIdAtom) === requestId) {
        set(scheduledTasksLoadingAtom, false);
      }
    }
  }
);

export const updateScheduledTaskAtom = atom(
  null,
  async (
    _get,
    set,
    input: {
      taskId: string;
      workspaceId: string;
      updates: ScheduledTaskUpdateInput["updates"];
    }
  ) => {
    const task = await window.zora.updateScheduledTask({
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      updates: input.updates,
    });

    await set(loadScheduledTasksAtom);
    set(selectedScheduledTaskSelectionAtom, toSelection(task));

    return task;
  }
);

export const setScheduledTaskStatusAtom = atom(
  null,
  async (
    _get,
    set,
    input: {
      taskId: string;
      workspaceId: string;
      status: Extract<ScheduledTaskStatus, "active" | "paused">;
    }
  ) => {
    return set(updateScheduledTaskAtom, {
      taskId: input.taskId,
      workspaceId: input.workspaceId,
      updates: {
        status: input.status,
      },
    });
  }
);

export const deleteScheduledTaskAtom = atom(
  null,
  async (_get, set, input: { taskId: string; workspaceId: string }) => {
    await window.zora.deleteScheduledTask(input.taskId, input.workspaceId);
    return set(loadScheduledTasksAtom);
  }
);
