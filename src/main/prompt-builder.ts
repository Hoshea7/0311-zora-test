import { ZORA_STATIC_SYSTEM_PROMPT } from "./prompts/zora-static-system-prompt";

export type ZoraSystemPrompt = {
  type: "preset";
  preset: "claude_code";
  append: string;
};

export async function buildZoraSystemPrompt(): Promise<ZoraSystemPrompt> {
  return {
    type: "preset",
    preset: "claude_code",
    append: ZORA_STATIC_SYSTEM_PROMPT,
  };
}
