# ZoraAgent QA

Zora 的 QA 资产现在分成两类：

| 区域 | 用途 |
|------|------|
| `tests/` | L1/L2 代码级自动化测试，以及 `test:live` 真实 SDK 诊断 |
| `qa/gui/` | L3 GUI Product Review，Codex 通过 Computer Use 模拟真实用户完成产品巡检 |

旧的 YAML case 体系已经清理，当前只保留 V2 多维表格和 `qa/gui/` 规则作为有效质量资产。

## 当前测试分层

| 层级 | 目标 | 执行方式 |
|------|------|----------|
| L1 Unit | 纯函数和单模块逻辑正确 | `bun run test:unit` |
| L2 Integration | 多模块协作正确，使用 mock/临时目录 | `bun run test:integration` |
| L3 Product Review | 产品真实链路、GUI 交互、Agent 体验正确 | Codex + Computer Use，按 `qa/gui/` 执行 |

`bun run test:live` 保留为真实 SDK 诊断层，用来确认 Provider/SDK/基础 Agent 调用可用。它不是 GUI 产品巡检的替代品。

## 产品质量知识库 V2

Zora 的质量管理不再以旧 YAML checklist 为主，而是维护一套“产品功能 → 架构能力 → 产品规则 → 测试 Case → 执行记录 → 问题改进”的闭环。

当前飞书多维表格 V2 表：

| 表 | 作用 |
|----|------|
| `V2｜产品功能地图` | 按用户视角拆解 Zora 的一级/二级/三级产品功能，并关联能力、规则和 Case |
| `V2｜架构能力单元` | 描述功能背后的能力单元，并按 `产品体验层 / Agent Harness层 / Agent链路层` 分类 |
| `V2｜产品规则与验收准则` | 记录当前版本的业务逻辑、交互准则、数据准则、安全准则和测试准则 |
| `V2｜测试用例` | 记录 L1/L2/L3 用例、覆盖能力、覆盖规则和执行方式 |
| `V2｜测试执行记录` | 记录每次 CI、Live SDK 或 Codex GUI 巡检的运行结果 |
| `V2｜问题与改进` | 记录产品缺陷、体验问题、技术债、测试工具问题和规则待澄清项 |

使用口径：

| 字段/概念 | 口径 |
|----------|------|
| `发版等级` | 不是产品排期优先级，而是质量门禁权重：P0 必须覆盖，P1 重点覆盖，P2 抽样覆盖，P3 相关改动时覆盖 |
| `当前状态 = 部分可用` | 主路径存在，但仍有明确缺口、边界风险、体验问题或测试覆盖不足；P0 的“部分可用”必须能在 `缺口/备注` 或 `问题与改进` 中找到原因 |
| `主归属` | 用于说明功能主要落在产品体验、Agent Harness、Agent 链路，混合流程只用于初始化/飞书等跨层链路 |
| `产品规则与验收准则` | 只承载跨功能规则；单个功能的验收口径优先写在产品功能地图和测试用例里 |

层级定义：

| 层 | 判断标准 |
|----|----------|
| 产品体验层 | 用户看得见、点得到、感知得到 |
| Agent Harness层 | 影响 Agent 如何获取上下文、使用模型、调用工具、记忆用户和协作执行 |
| Agent链路层 | Agent 内核如何理解、规划、执行、观察和回复 |

## 常用命令

```bash
# L1 + L2
bun run test

# 类型检查
bun run typecheck

# 真实 SDK 诊断
bun run test:live

# 启动 L3 GUI 初始化巡检环境（不预置 Provider）
bun run test:gui:init

# 启动 L3 GUI 初始化巡检环境（复制本机默认 Provider 到隔离 HOME）
bun run test:gui:init:local-provider

# 清理 GUI 测试 HOME，保留报告/截图/日志
bun run test:gui:clean

# 发版前代码门禁 + 提示 GUI 巡检
bun run test:release
```

## L3 GUI 如何触发

当用户说：

```text
开始发版前 L3 产品巡检
```

Codex 应读取 `qa/gui/release-smoke.md`，启动隔离 HOME 的 Electron 应用，并通过 Computer Use 执行 GUI 流程。

测试产物写入：

```text
tests/.artifacts/gui/runs/<run-id>/
├── home/.zora/       # 真实 Zora home 结构，测试结束后清理
├── logs/
├── screenshots/
└── report.md
```

原则：case 是标准，Computer Use 是执行者，report 是证据。

真实 Provider 只允许短暂停留在隔离 `home/.zora` 中。测试完成后执行 `bun run test:gui:clean` 删除测试 HOME，只保留脱敏报告。
