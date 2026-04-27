1. 你称呼我”天~“
2. 想全面，做仔细

在设计和执行代码的时候，应该优先参考官方文档：
- 官方文档参考：/Users/bytedance/Desktop/code/learn/0311-zora/claude_agent_sdk_ref

## 测试与产品巡检规则

> 以下规则适用于所有功能开发、优化和修复。每次修改代码时必须检查。

### 三层测试定位

| 层级 | 目标 | 执行方式 |
|------|------|----------|
| L1 Unit | 纯函数和单模块逻辑正确 | `bun run test:unit` |
| L2 Integration | 多模块协作正确，使用 mock/临时目录 | `bun run test:integration` |
| L3 Product Review | GUI、真实用户链路、Agent 体验正确 | Codex + Computer Use，按 `qa/gui/` 执行 |

`bun run test:live` 是真实 SDK 诊断层，用来确认 Provider/SDK/基础 Agent 调用可用。它不能替代 L3 GUI Product Review。

### L3 GUI Product Review 触发规则

当用户说以下任一句时，Codex 必须进入 L3 GUI Product Review 模式：

- `开始发版前 L3 产品巡检`
- `跑一遍 GUI 发版巡检`
- `用 Computer Use 测 Zora 初始化流程`

执行要求：

1. 先读取 `qa/gui/README.md` 和 `qa/gui/release-smoke.md`。
2. 如用户允许使用本机默认 Provider，用 `bun run test:gui:init:local-provider` 启动隔离 HOME 的 Electron；否则用 `bun run test:gui:init`。
3. 使用 Computer Use 选择正在运行的 `Electron` 窗口。
4. 按 `qa/gui/cases/` 的剧本执行真实点击、输入、观察和判断。
5. 将报告写入 `tests/.artifacts/gui/runs/<run-id>/report.md`。
6. 发现的问题必须归类为 `产品缺陷`、`体验问题`、`技术债`、`测试工具问题` 或 `规则待澄清`。
7. 测试结束后必须主动运行或提醒运行 `bun run test:gui:clean`，删除隔离测试 HOME。若需要保留现场排查，必须先征得用户同意。

### 测试产物隔离

GUI 测试必须复用真实 Zora 文件结构，只替换 HOME：

```text
tests/.artifacts/gui/runs/<run-id>/home/.zora/
```

禁止在项目根目录生成 `MEMORY.md`、`USER.md`、`SOUL.md` 或 `memory/`。

真实 SDK GUI 测试期间，隔离 HOME 可以短暂保存完整 Provider 配置，包括 API key 和 baseUrl，因为应用需要它们调用模型。报告和聊天回复中禁止泄露 API key。测试完成后必须删除隔离 HOME，只保留脱敏报告、截图和必要日志。

### 产品质量知识库

Zora 的产品质量知识库维护在飞书多维表格中。当前采用 V2 结构，不再直接维护旧的 `产品功能清单 / 验证清单 / Bugs` 作为主流程。

核心概念：

| 概念 | 含义 |
|------|------|
| 产品功能地图 | 按用户视角描述 Zora 有哪些功能和流程 |
| 架构能力单元 | 按 `产品体验层 / Agent Harness层 / Agent链路层` 拆解功能背后的能力 |
| 产品规则与验收准则 | 当前版本的业务逻辑、交互准则、数据准则、安全准则和测试准则 |
| 测试用例 | L1/L2/L3 用例，说明如何证明能力和规则成立 |
| 测试执行记录 | 每次 CI、Live SDK 或 Codex GUI 巡检的运行结果 |
| 问题与改进 | Bug、体验问题、技术债、测试工具问题和规则待澄清项 |

三层能力定义：

| 层 | 定义 |
|----|------|
| 产品体验层 | 用户看得见、点得到、感知得到的产品功能，例如配置页、侧边栏、输入框、会话列表、消息渲染和唤醒入口 |
| Agent Harness层 | Zora 包在 Agent 外面的支撑与控制系统，例如渠道模型管理、上下文管理、记忆注入、Skill/MCP、权限、AskUser 和人机协作策略 |
| Agent链路层 | Agent 内核执行链路，例如理解问题、规划、Todo、工具调用、观察结果、反思和回复；当前主要由 Claude Agent SDK 承担 |

### 何时必须同步测试

| 变更类型 | 必须做什么 |
|----------|-----------|
| 新增纯函数/工具函数 | 增加或更新 L1 单元测试 |
| 新增主进程/渲染进程模块协作 | 增加或更新 L2 集成测试 |
| 涉及 Provider/SDK/Agent 调用 | 跑 `bun run test:live`，必要时补 live 诊断测试 |
| 用户可感知功能变化 | 更新 `qa/gui/` 对应剧本或产品规则与验收准则 |
| Bug 修复 | 增加 L1/L2 回归断言；若是体验问题，沉淀到 `qa/gui/product-rules.md` |

### PR 提交前自查清单

- [ ] 新增/修改的代码有对应 L1/L2 测试覆盖
- [ ] `bun run test` 全绿
- [ ] `bun run typecheck` 通过
- [ ] 如涉及 SDK 调用路径变更，`bun run test:live` 通过
- [ ] 如涉及用户可感知行为，已更新 `qa/gui/` 剧本或产品规则与验收准则
- [ ] 如修复 Bug，已把问题沉淀为测试断言或产品规则

### 测试文件位置约定

| 被测内容 | 测试或 QA 资产 |
|----------|----------------|
| `src/main/xxx.ts` | `tests/unit/main/xxx.test.ts` |
| `src/renderer/utils/xxx.ts` | `tests/unit/renderer/utils/xxx.test.ts` |
| 模块间交互 | `tests/integration/xxx.test.ts` |
| 真实 SDK 诊断 | `tests/live/xxx.test.ts` |
| GUI 产品巡检 | `qa/gui/cases/*.md` + Computer Use |
