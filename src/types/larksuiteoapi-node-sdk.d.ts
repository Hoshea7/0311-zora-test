declare module "@larksuiteoapi/node-sdk" {
  export const AppType: {
    SelfBuild: string;
  };

  export const Domain: {
    Feishu: string;
  };

  export const LoggerLevel: {
    warn: string;
  };

  export class EventDispatcher {
    constructor(options?: { loggerLevel?: string });
    register(handlers: Record<string, (data: unknown) => void>): EventDispatcher;
  }

  export class WSClient {
    constructor(options?: {
      appId?: string;
      appSecret?: string;
      domain?: string;
      loggerLevel?: string;
    });
    start(options?: { eventDispatcher?: EventDispatcher }): Promise<void>;
    close(options?: { force?: boolean }): void;
  }

  type LarkResponse<T = Record<string, unknown>> = {
    code?: number;
    msg?: string;
    data?: T;
  };

  export class Client {
    constructor(options?: {
      appId?: string;
      appSecret?: string;
      appType?: string;
      domain?: string;
    });

    im: {
      message: {
        create(args: unknown): Promise<LarkResponse<{ message_id?: string }>>;
        reply(args: unknown): Promise<LarkResponse<{ message_id?: string }>>;
        patch(args: unknown): Promise<LarkResponse>;
      };
      messageReaction: {
        create(args: unknown): Promise<LarkResponse<{ reaction_id?: string | null }>>;
        list(args: unknown): Promise<
          LarkResponse<{
            items?: Array<{
              operator?: { operator_type?: string };
              reaction_type?: { emoji_type?: string };
              reaction_id?: string | null;
            }>;
          }>
        >;
        delete(args: unknown): Promise<LarkResponse>;
      };
    };
  }
}
