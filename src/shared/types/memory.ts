export interface MemorySettings {
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
}

export const DEFAULT_MEMORY_SETTINGS: MemorySettings = {
  mode: "batch",
  batchIdleMinutes: 30,
  memoryProviderId: null,
};
