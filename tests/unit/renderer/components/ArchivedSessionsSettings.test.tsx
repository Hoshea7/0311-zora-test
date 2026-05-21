import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Provider } from "jotai";
import { vi } from "vitest";
import type { ArchivedSessionEntry, SessionMeta } from "@/shared/zora";
import { ArchivedSessionsSettings } from "@/renderer/components/settings/ArchivedSessionsSettings";

const NOW = "2026-05-21T08:00:00.000Z";

function createSession(id: string, title: string): SessionMeta {
  return {
    id,
    title,
    createdAt: NOW,
    updatedAt: NOW,
    archivedAt: NOW,
  };
}

function createArchivedEntry(
  id: string,
  title: string,
  workspaceId = "default"
): ArchivedSessionEntry {
  return {
    session: createSession(id, title),
    workspaceId,
    workspaceName: workspaceId === "default" ? "默认区" : "测试项目",
    workspacePath: workspaceId === "default" ? "" : `/tmp/${workspaceId}`,
  };
}

function renderSettings() {
  render(
    <Provider>
      <ArchivedSessionsSettings />
    </Provider>
  );
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });

  return { promise, resolve, reject };
}

describe("ArchivedSessionsSettings", () => {
  it("restores all selected archived sessions in one batch", async () => {
    const entries = [
      createArchivedEntry("session-a", "会话 A"),
      createArchivedEntry("session-b", "会话 B", "workspace-1"),
    ];
    vi.mocked(window.zora.listArchivedSessions).mockResolvedValue(entries);
    vi.mocked(window.zora.restoreSession).mockImplementation(
      async (sessionId) =>
        createSession(sessionId, sessionId === "session-a" ? "会话 A" : "会话 B")
    );

    renderSettings();

    await screen.findByText("会话 A");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "选择全部归档会话" })
    );

    expect(screen.getByText("已选 2")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "批量恢复" }));
    expect(
      screen.getByRole("dialog", { name: "恢复 2 条归档会话？" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "确认恢复" }));

    await waitFor(() => {
      expect(window.zora.restoreSession).toHaveBeenCalledTimes(2);
    });
    expect(window.zora.restoreSession).toHaveBeenNthCalledWith(
      1,
      "session-a",
      "default"
    );
    expect(window.zora.restoreSession).toHaveBeenNthCalledWith(
      2,
      "session-b",
      "workspace-1"
    );
    await waitFor(() => {
      expect(screen.getByText("没有已归档会话")).toBeInTheDocument();
    });
  });

  it("runs batch restore one entry at a time to avoid index write races", async () => {
    const entries = [
      createArchivedEntry("session-a", "会话 A"),
      createArchivedEntry("session-b", "会话 B"),
    ];
    const firstRestore = createDeferred<SessionMeta>();

    vi.mocked(window.zora.listArchivedSessions).mockResolvedValue(entries);
    vi.mocked(window.zora.restoreSession).mockImplementation(
      async (sessionId) => {
        if (sessionId === "session-a") {
          return firstRestore.promise;
        }

        return createSession("session-b", "会话 B");
      }
    );

    renderSettings();

    await screen.findByText("会话 A");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "选择全部归档会话" })
    );
    fireEvent.click(screen.getByRole("button", { name: "批量恢复" }));
    fireEvent.click(screen.getByRole("button", { name: "确认恢复" }));

    await waitFor(() => {
      expect(window.zora.restoreSession).toHaveBeenCalledTimes(1);
    });
    expect(window.zora.restoreSession).toHaveBeenCalledWith(
      "session-a",
      "default"
    );

    firstRestore.resolve(createSession("session-a", "会话 A"));

    await waitFor(() => {
      expect(window.zora.restoreSession).toHaveBeenCalledTimes(2);
    });
    expect(window.zora.restoreSession).toHaveBeenNthCalledWith(
      2,
      "session-b",
      "default"
    );
  });

  it("confirms before permanently deleting selected archived sessions", async () => {
    const entries = [
      createArchivedEntry("session-a", "会话 A"),
      createArchivedEntry("session-b", "会话 B", "workspace-1"),
    ];
    vi.mocked(window.zora.listArchivedSessions).mockResolvedValue(entries);
    vi.mocked(window.zora.deleteSession).mockResolvedValue(undefined);

    renderSettings();

    await screen.findByText("会话 A");
    fireEvent.click(
      screen.getByRole("checkbox", { name: "选择全部归档会话" })
    );
    fireEvent.click(screen.getByRole("button", { name: "批量删除" }));

    expect(
      screen.getByRole("dialog", { name: "永久删除 2 条归档会话？" })
    ).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "永久删除" }));

    await waitFor(() => {
      expect(window.zora.deleteSession).toHaveBeenCalledTimes(2);
    });
    expect(window.zora.deleteSession).toHaveBeenNthCalledWith(
      1,
      "session-a",
      "default"
    );
    expect(window.zora.deleteSession).toHaveBeenNthCalledWith(
      2,
      "session-b",
      "workspace-1"
    );
    await waitFor(() => {
      expect(screen.getByText("没有已归档会话")).toBeInTheDocument();
    });
  });
});
