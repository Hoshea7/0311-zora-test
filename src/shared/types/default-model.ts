export interface DefaultModelSettings {
  /**
   * 新会话默认使用的 Provider。
   * null 表示跟随当前默认 Provider。
   */
  defaultProviderId: string | null;

  /**
   * 新会话默认使用的模型覆盖值。
   * null 表示使用所选 Provider 的主模型。
   */
  defaultModelId: string | null;
}

export const DEFAULT_DEFAULT_MODEL_SETTINGS: DefaultModelSettings = {
  defaultProviderId: null,
  defaultModelId: null,
};
