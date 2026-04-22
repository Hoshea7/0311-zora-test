export interface DefaultModelSettings {
  /**
   * 新会话默认使用的模型所属 Provider。
   * 这是内部解析目标，不直接作为独立设置项暴露给用户。
   */
  defaultProviderId: string | null;

  /**
   * 新会话默认使用的模型 ID。
   * null 表示当前没有显式默认模型。
   */
  defaultModelId: string | null;
}

export const DEFAULT_DEFAULT_MODEL_SETTINGS: DefaultModelSettings = {
  defaultProviderId: null,
  defaultModelId: null,
};
