export interface MemorySettings {
  /** 是否启用 Zora 记忆；关闭后不注入长期记忆，也不处理新的记忆提取。 */
  enabled: boolean;

  /** 记忆处理模式 */
  mode: "immediate" | "batch" | "manual";

  /**
   * 批量模式的空闲超时时间（分钟），仅 batch 模式下有意义。
   * 默认 30，用户可选 10 | 20 | 30 | 60 | 120。
   */
  batchIdleMinutes: number;

  /**
   * Memory Agent 使用的 Provider ID。
   * null 表示跟随默认模型。
   * 值为某个已配置 Provider 的 id（ProviderConfig.id）。
   */
  memoryProviderId: string | null;

  /**
   * Memory Agent 使用的模型覆盖值。
   * null 表示使用所选 Provider 的默认模型。
   * 若填写，则必须是该 Provider 上某个可用模型（主模型或 role model）。
   */
  memoryModelId: string | null;
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  enabled: true,
  mode: "immediate",
  batchIdleMinutes: 30,
  memoryProviderId: null,
  memoryModelId: null,
};
