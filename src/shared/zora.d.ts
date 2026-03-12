export type AgentStatus = "started" | "finished" | "stopped";

export type AgentControlEvent =
  | {
      type: "agent_status";
      status: AgentStatus;
    }
  | {
      type: "agent_error";
      error: string;
    };

export type AgentStreamEvent = AgentControlEvent | ({ type: string } & Record<string, unknown>);

export type AppPhase = "splash" | "awakening" | "chat";

export interface ZoraApi {
  getAppVersion: () => Promise<string>;
  chat: (text: string) => Promise<void>;
  onStream: (callback: (event: AgentStreamEvent) => void) => () => void;
  stopAgent: () => Promise<void>;
  isAwakened: () => Promise<boolean>;
}

declare global {
  interface Window {
    zora: ZoraApi;
  }
}

export {};
