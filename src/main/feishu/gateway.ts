import * as lark from "@larksuiteoapi/node-sdk";
import type { FeishuConnectionTestResult } from "../../shared/types/feishu";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeRequiredString(value: unknown, fieldName: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${fieldName} is required.`);
  }

  return value.trim();
}

function getLarkResponseErrorMessage(
  response: { code?: number; msg?: string },
  fallback: string
): string | null {
  if (response.code === undefined || response.code === 0) {
    return null;
  }

  if (typeof response.msg === "string" && response.msg.trim().length > 0) {
    return response.msg.trim();
  }

  return `${fallback} (code: ${response.code})`;
}

function stringifyError(error: unknown): string {
  if (isRecord(error)) {
    const response = isRecord(error.response) ? error.response : null;
    const data = response && isRecord(response.data) ? response.data : null;

    if (data && typeof data.msg === "string" && data.msg.trim().length > 0) {
      return data.msg.trim();
    }

    if (response && typeof response.status === "number") {
      return `请求失败 (${response.status})`;
    }
  }

  if (error instanceof Error) {
    return error.message;
  }

  return typeof error === "string" ? error : String(error);
}

function extractBotName(app: unknown): string | null {
  if (!isRecord(app)) {
    return null;
  }

  if (typeof app.app_name === "string" && app.app_name.trim().length > 0) {
    return app.app_name.trim();
  }

  if (Array.isArray(app.i18n)) {
    const preferredLocales = ["zh_cn", "en_us", "ja_jp"];

    for (const locale of preferredLocales) {
      const match = app.i18n.find(
        (item) =>
          isRecord(item) &&
          item.i18n_key === locale &&
          typeof item.name === "string" &&
          item.name.trim().length > 0
      );

      if (match && typeof match.name === "string") {
        return match.name.trim();
      }
    }
  }

  return null;
}

export async function testFeishuConnection(
  appId: string,
  appSecret: string
): Promise<FeishuConnectionTestResult> {
  const normalizedAppId = normalizeRequiredString(appId, "feishu.appId");
  const normalizedAppSecret = normalizeRequiredString(appSecret, "feishu.appSecret");

  try {
    const client = new lark.Client({
      appId: normalizedAppId,
      appSecret: normalizedAppSecret,
      appType: lark.AppType.SelfBuild,
      domain: lark.Domain.Feishu,
    });

    const tokenResult = await client.auth.tenantAccessToken.internal({
      data: {
        app_id: normalizedAppId,
        app_secret: normalizedAppSecret,
      },
    });

    const tokenErrorMessage = getLarkResponseErrorMessage(tokenResult, "飞书凭证校验失败");
    if (tokenErrorMessage) {
      return {
        success: false,
        error: tokenErrorMessage,
        botName: null,
      };
    }

    let botName: string | null = null;

    try {
      const appInfoResult = await client.application.v6.application.get({
        path: { app_id: normalizedAppId },
        params: { lang: "zh_cn" },
      });

      if (!getLarkResponseErrorMessage(appInfoResult, "读取应用信息失败")) {
        botName = extractBotName(appInfoResult.data?.app);
      }
    } catch (error) {
      console.warn("[feishu:test] Failed to fetch bot info from application API:", error);
    }

    return {
      success: true,
      error: null,
      botName,
    };
  } catch (error) {
    console.error("[feishu:test] Connection test failed:", error);
    return {
      success: false,
      error: stringifyError(error),
      botName: null,
    };
  }
}
