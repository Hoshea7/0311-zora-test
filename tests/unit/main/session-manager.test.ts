async function loadSessionManagerModule() {
  vi.resetModules();
  return import("@/main/session-manager");
}

describe("main session-manager", () => {
  it("stores and retrieves session ids by channel", async () => {
    const { getSessionId, setSessionId } = await loadSessionManagerModule();

    setSessionId("awakening", "session-awakening");
    setSessionId("productivity", "session-productivity");

    expect(getSessionId("awakening")).toBe("session-awakening");
    expect(getSessionId("productivity")).toBe("session-productivity");
  });

  it("reports presence and clears individual sessions", async () => {
    const { clearSessionId, getSessionId, hasSession, setSessionId } =
      await loadSessionManagerModule();

    setSessionId("productivity", "session-1");

    expect(hasSession("productivity")).toBe(true);

    clearSessionId("productivity");

    expect(hasSession("productivity")).toBe(false);
    expect(getSessionId("productivity")).toBeUndefined();
  });

  it("clears all tracked sessions at once", async () => {
    const { clearAllSessions, getSessionId, setSessionId } =
      await loadSessionManagerModule();

    setSessionId("awakening", "session-awakening");
    setSessionId("productivity", "session-productivity");

    clearAllSessions();

    expect(getSessionId("awakening")).toBeUndefined();
    expect(getSessionId("productivity")).toBeUndefined();
  });
});
