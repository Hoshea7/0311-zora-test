# 产品规则与验收准则

这里记录 Zora 当前版本的产品业务逻辑、交互准则、数据准则、安全准则和测试准则。

它不是“永远不能改变的不变量”。当产品设计演进时，这里的规则也可以被更新、废弃或替换。关键是：每条规则都应该能关联到产品能力、测试 Case 或历史问题。

推荐流转：

```text
发现问题 → 修复问题 → 提炼为产品规则 → 吸收到对应 GUI 剧本或 L1/L2 断言
```

## 当前规则

### RULE-INIT-001 全新环境必须进入唤醒

全新或无有效 Zora 档案的环境必须进入唤醒流程，不能直接进入旧用户主界面。

验收标准：

- 隔离 HOME 下首次启动后，界面进入 Provider/唤醒引导。
- 不读取开发者真实 `~/.zora`。
- 不直接恢复真实用户历史 session。

覆盖 Case：`L3-INIT-001`

### RULE-PROV-001 L3 GUI 报告禁止泄露 API key

L3 GUI 测试可以复制本机默认 Provider 到隔离 HOME，但报告禁止记录 API key。

验收标准：

- 报告只出现 Provider 名称、模型和 baseUrl。
- API key 只允许短暂停留在本次隔离 `home/.zora/providers.json`。
- 测试结束后执行 `bun run test:gui:clean` 清理测试 HOME。

覆盖 Case：`L3-INIT-001`

### RULE-AWAK-001 唤醒完成后必须生成 Zora 档案

唤醒完成后必须生成 `SOUL.md`、`IDENTITY.md`、`USER.md`，并能进入主界面。

验收标准：

- 文件位于隔离 `home/.zora/zoras/default/`。
- 主界面可继续日常对话。
- 后续对话能读取并使用用户画像。

覆盖 Case：`L3-INIT-001`

### RULE-MEM-001 缺少 MEMORY.md 不应造成用户可见错误

缺少 `MEMORY.md` 不应造成用户可见错误，也不应阻断日常对话。

验收标准：

- Agent 可优雅跳过缺失文件，或初始化空文件。
- 最终回复不暴露工具错误。
- 日常对话仍可读取 `USER.md` 和 `SOUL.md` 中的有效画像。

覆盖 Case：`L3-INIT-001`

状态：待修复或待产品确认。

### RULE-CTX-001 大 payload 不得污染 Provider 请求

超大工具结果或 base64 payload 不得原样进入 Provider 请求上下文。

验收标准：

- Provider payload 保持合理大小。
- PDF、图片等大内容被摘要、截断或引用化。
- 历史 PDF 422 问题不能回归。

覆盖 Case：`L2-REG-PDF-422`

### RULE-QA-001 L3 GUI 巡检必须清理测试 HOME

L3 GUI 巡检必须使用隔离 HOME，结束后默认清理测试 HOME，只保留脱敏报告、截图和日志。

验收标准：

- 运行 `bun run test:gui:clean` 后，`tests/.artifacts/gui/runs/*/home` 不存在。
- 项目根目录不生成 `MEMORY.md`、`USER.md`、`SOUL.md` 或 `memory/`。
- 若需要保留现场，必须先明确告诉用户并在报告中标注。
