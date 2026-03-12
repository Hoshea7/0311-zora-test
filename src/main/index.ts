import { app, BrowserWindow, ipcMain } from "electron";
import path from "node:path";
import type {
  AgentStreamEvent,
  PermissionResponse,
  AskUserResponse,
} from "../shared/zora";
import {
  isClaudeAgentRunning,
  runClaudeAgentChat,
  stopClaudeAgentChat,
  respondToPermission,
  respondToAskUser,
} from "./agent";

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

function createWindow() {
  const window = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 960,
    minHeight: 640,
    backgroundColor: "#09111f",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      preload: path.join(app.getAppPath(), "dist", "main", "preload.js")
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL);
    return;
  }

  window.loadFile(path.join(app.getAppPath(), "dist", "renderer", "index.html"));
}

app.whenReady().then(() => {
  ipcMain.handle("app:get-version", () => app.getVersion());
  ipcMain.handle("agent:chat", async (event, text: unknown) => {
    if (typeof text !== "string" || text.trim().length === 0) {
      throw new Error("A non-empty prompt is required.");
    }

    if (isClaudeAgentRunning()) {
      throw new Error("Claude Agent is already running.");
    }

    const target = event.sender;
    const forwardEvent = (payload: AgentStreamEvent) => {
      if (!target.isDestroyed()) {
        target.send("agent:stream", payload);
      }
    };

    await runClaudeAgentChat({
      cwd: app.getAppPath(),
      prompt: text.trim(),
      onEvent: forwardEvent
    });
  });
  ipcMain.handle("agent:stop", async () => {
    await stopClaudeAgentChat();
  });
  ipcMain.handle(
    "agent:permission:respond",
    async (_event, response: PermissionResponse) => {
      respondToPermission(
        response.requestId,
        response.behavior,
        response.alwaysAllow,
        response.userMessage
      );
    }
  );

  ipcMain.handle(
    "agent:ask-user:respond",
    async (_event, response: AskUserResponse) => {
      respondToAskUser(response.requestId, response.answers);
    }
  );
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
