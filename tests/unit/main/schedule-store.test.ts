import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

const tempHomes = new Set<string>();

function createTempHome() {
  const homeDir = mkdtempSync(path.join(tmpdir(), "zora-schedule-"));
  tempHomes.add(homeDir);
  return homeDir;
}

function getSchedulesDir(homeDir: string, workspaceId = "default") {
  return path.join(homeDir, ".zora", "workspaces", workspaceId, "schedules");
}

function getTasksFile(homeDir: string, workspaceId = "default") {
  return path.join(getSchedulesDir(homeDir, workspaceId), "tasks.json");
}

function seedWorkspaces(homeDir: string) {
  mkdirSync(path.join(homeDir, ".zora"), { recursive: true });
  writeFileSync(
    path.join(homeDir, ".zora", "workspaces.json"),
    JSON.stringify(
      [
        {
          id: "workspace-2",
          name: "Project workspace",
          path: path.join(homeDir, "project"),
          createdAt: new Date(2026, 4, 14, 9, 0, 0).toISOString(),
          updatedAt: new Date(2026, 4, 14, 9, 0, 0).toISOString(),
        },
      ],
      null,
      2
    ),
    "utf8"
  );
}

async function loadScheduleStoreModule(homeDir: string) {
  vi.resetModules();

  vi.doMock("node:os", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:os")>();
    return {
      ...actual,
      homedir: () => homeDir,
    };
  });

  return import("@/main/schedule-store");
}

afterEach(() => {
  vi.useRealTimers();
  vi.doUnmock("node:os");
  vi.resetModules();

  for (const homeDir of tempHomes) {
    rmSync(homeDir, { recursive: true, force: true });
  }
  tempHomes.clear();
});

describe("main schedule-store", () => {
  it("does not advance a daily task merely because the list is read", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 7, 50, 0));
    const { createScheduledTask, listScheduledTasks } =
      await loadScheduleStoreModule(homeDir);

    const task = await createScheduledTask({
      workspaceId: "default",
      title: "Daily task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理待办。",
      schedule: { type: "daily", time: "08:00" },
    });
    const originalNextRunAt = task.nextRunAt;

    vi.setSystemTime(new Date(2026, 4, 14, 8, 5, 0));
    const listed = await listScheduledTasks();

    expect(listed[0]).toEqual(
      expect.objectContaining({
        id: task.id,
        nextRunAt: originalNextRunAt,
      })
    );

    const persisted = JSON.parse(readFileSync(getTasksFile(homeDir), "utf8"));
    expect(persisted[0].nextRunAt).toBe(originalNextRunAt);
  });

  it("preserves nextRunAt when updating non-schedule fields", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 7, 50, 0));
    const { createScheduledTask, updateScheduledTask } =
      await loadScheduleStoreModule(homeDir);

    const task = await createScheduledTask({
      workspaceId: "default",
      title: "Daily task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理待办。",
      schedule: { type: "daily", time: "08:00" },
    });

    vi.setSystemTime(new Date(2026, 4, 14, 9, 0, 0));
    const updated = await updateScheduledTask({
      workspaceId: "default",
      taskId: task.id,
      updates: {
        executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理今天的工作待办。",
        status: "paused",
      },
    });

    expect(updated.nextRunAt).toBe(task.nextRunAt);
  });

  it("keeps a daily schedule on today when the updated time is still ahead", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 10, 30, 0));
    const { createScheduledTask, updateScheduledTask } =
      await loadScheduleStoreModule(homeDir);

    const task = await createScheduledTask({
      workspaceId: "default",
      title: "Daily task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理待办。",
      schedule: { type: "daily", time: "08:00" },
    });

    const updated = await updateScheduledTask({
      workspaceId: "default",
      taskId: task.id,
      updates: {
        schedule: { type: "daily", time: "11:50" },
      },
    });

    expect(updated.nextRunAt).toBe(new Date(2026, 4, 14, 11, 50, 0).toISOString());
  });

  it("moves a daily schedule to tomorrow when the updated time has passed today", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 10, 30, 0));
    const { createScheduledTask, updateScheduledTask } =
      await loadScheduleStoreModule(homeDir);

    const task = await createScheduledTask({
      workspaceId: "default",
      title: "Daily task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理待办。",
      schedule: { type: "daily", time: "12:00" },
    });

    const updated = await updateScheduledTask({
      workspaceId: "default",
      taskId: task.id,
      updates: {
        schedule: { type: "daily", time: "09:30" },
      },
    });

    expect(updated.nextRunAt).toBe(new Date(2026, 4, 15, 9, 30, 0).toISOString());
  });

  it("serializes concurrent creates so no task is lost", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 9, 0, 0));
    const { createScheduledTask, listScheduledTasks } =
      await loadScheduleStoreModule(homeDir);

    await Promise.all(
      Array.from({ length: 8 }, (_, index) =>
        createScheduledTask({
          workspaceId: "default",
          title: `Task ${index + 1}`,
          executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n执行测试任务。",
          schedule: {
            type: "once",
            runAt: new Date(Date.now() + 60_000 + index * 1_000).toISOString(),
          },
        })
      )
    );

    const listed = await listScheduledTasks();
    expect(listed).toHaveLength(8);
    expect(new Set(listed.map((task) => task.id)).size).toBe(8);
  });

  it("does not silently overwrite a malformed tasks file", async () => {
    const homeDir = createTempHome();
    mkdirSync(getSchedulesDir(homeDir), { recursive: true });
    writeFileSync(getTasksFile(homeDir), "{not valid json", "utf8");
    const { createScheduledTask, listScheduledTasks } =
      await loadScheduleStoreModule(homeDir);

    await expect(listScheduledTasks()).rejects.toThrow("读取定时任务失败");
    await expect(
      createScheduledTask({
        workspaceId: "default",
        title: "New task",
        executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n提醒用户。",
        schedule: {
          type: "once",
          runAt: new Date(Date.now() + 60_000).toISOString(),
        },
      })
    ).rejects.toThrow("读取定时任务失败");

    expect(readFileSync(getTasksFile(homeDir), "utf8")).toBe("{not valid json");
  });

  it("calculates the next weekly run from selected weekdays", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 9, 0, 0));
    const { createScheduledTask } = await loadScheduleStoreModule(homeDir);

    const task = await createScheduledTask({
      workspaceId: "default",
      title: "Weekly task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理项目风险。",
      schedule: { type: "weekly", weekdays: [1, 3, 5], time: "08:00" },
    });

    expect(task.schedule).toEqual({
      type: "weekly",
      weekdays: [1, 3, 5],
      time: "08:00",
    });
    expect(task.nextRunAt).toBe(new Date(2026, 4, 15, 8, 0, 0).toISOString());
  });

  it("calculates hourly tasks from the next hour boundary", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 9, 20, 30));
    const { createScheduledTask } = await loadScheduleStoreModule(homeDir);

    const task = await createScheduledTask({
      workspaceId: "default",
      title: "Hourly task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n检查一次状态。",
      schedule: { type: "hourly" },
    });

    expect(task.schedule).toEqual({ type: "hourly" });
    expect(task.nextRunAt).toBe(new Date(2026, 4, 14, 10, 20, 0).toISOString());
  });

  it("skips weekends for weekday schedules", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 15, 9, 0, 0));
    const { createScheduledTask } = await loadScheduleStoreModule(homeDir);

    const task = await createScheduledTask({
      workspaceId: "default",
      title: "Weekday task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理工作日摘要。",
      schedule: { type: "weekdays", time: "08:00" },
    });

    expect(task.schedule).toEqual({ type: "weekdays", time: "08:00" });
    expect(task.nextRunAt).toBe(new Date(2026, 4, 18, 8, 0, 0).toISOString());
  });

  it("claims a due one-time task once and records the run result", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 9, 0, 0));
    const {
      claimDueScheduledTask,
      createScheduledTask,
      getScheduledTask,
      recordScheduledTaskRun,
    } = await loadScheduleStoreModule(homeDir);

    const task = await createScheduledTask({
      workspaceId: "default",
      title: "One-time task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n提醒用户喝水。",
      schedule: {
        type: "once",
        runAt: new Date(2026, 4, 14, 9, 1, 0).toISOString(),
      },
    });

    const claimed = await claimDueScheduledTask(
      task.id,
      "default",
      new Date(2026, 4, 14, 9, 1, 1)
    );
    const duplicateClaim = await claimDueScheduledTask(
      task.id,
      "default",
      new Date(2026, 4, 14, 9, 1, 2)
    );
    const recorded = await recordScheduledTaskRun(task.id, "default", {
      success: false,
    });
    const persisted = await getScheduledTask(task.id, "default");

    expect(claimed?.id).toBe(task.id);
    expect(duplicateClaim).toBeNull();
    expect(recorded).toEqual(
      expect.objectContaining({
        runCount: 1,
        failureCount: 1,
        status: "paused",
      })
    );
    expect(persisted).toEqual(
      expect.objectContaining({
        runCount: 1,
        failureCount: 1,
        status: "paused",
      })
    );
  });

  it("claims a recurring task and advances its next run before execution", async () => {
    const homeDir = createTempHome();
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 7, 50, 0));
    const { claimDueScheduledTask, createScheduledTask, getScheduledTask } =
      await loadScheduleStoreModule(homeDir);

    const task = await createScheduledTask({
      workspaceId: "default",
      title: "Daily task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理日程。",
      schedule: { type: "daily", time: "08:00" },
    });

    const claimed = await claimDueScheduledTask(
      task.id,
      "default",
      new Date(2026, 4, 14, 8, 0, 1)
    );
    const persisted = await getScheduledTask(task.id, "default");

    expect(claimed?.id).toBe(task.id);
    expect(persisted).toEqual(
      expect.objectContaining({
        status: "active",
        nextRunAt: new Date(2026, 4, 15, 8, 0, 0).toISOString(),
      })
    );
  });

  it("lists scheduled tasks across all workspaces", async () => {
    const homeDir = createTempHome();
    seedWorkspaces(homeDir);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 9, 0, 0));
    const { createScheduledTask, listAllScheduledTasks } =
      await loadScheduleStoreModule(homeDir);

    await createScheduledTask({
      workspaceId: "default",
      title: "Default task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理默认工作区。",
      schedule: { type: "daily", time: "10:00" },
    });
    await createScheduledTask({
      workspaceId: "workspace-2",
      title: "Project task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理项目工作区。",
      schedule: { type: "daily", time: "11:00" },
    });

    const tasks = await listAllScheduledTasks();

    expect(tasks.map((task) => task.workspaceId)).toEqual([
      "default",
      "workspace-2",
    ]);
  });

  it("moves a scheduled task between workspaces", async () => {
    const homeDir = createTempHome();
    seedWorkspaces(homeDir);
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 4, 14, 9, 0, 0));
    const { createScheduledTask, listScheduledTasks, updateScheduledTask } =
      await loadScheduleStoreModule(homeDir);

    const task = await createScheduledTask({
      workspaceId: "default",
      title: "Movable task",
      executionPrompt: "# 定时任务执行说明\n\n## 任务目标\n整理工作区。",
      schedule: { type: "daily", time: "10:00" },
    });

    const moved = await updateScheduledTask({
      taskId: task.id,
      workspaceId: "default",
      updates: {
        workspaceId: "workspace-2",
      },
    });

    expect(moved.workspaceId).toBe("workspace-2");
    expect(await listScheduledTasks("default")).toHaveLength(0);
    expect(await listScheduledTasks("workspace-2")).toEqual([
      expect.objectContaining({
        id: task.id,
        workspaceId: "workspace-2",
      }),
    ]);
  });

  it("throws when deleting a missing scheduled task", async () => {
    const homeDir = createTempHome();
    const { deleteScheduledTask } = await loadScheduleStoreModule(homeDir);

    await expect(
      deleteScheduledTask("missing-task", "default")
    ).rejects.toThrow("找不到要删除的定时任务");
  });
});
