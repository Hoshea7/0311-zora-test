# L3-INIT-001 初始化：模型配置 → 唤醒 → 主界面

## 目标

验证全新用户在隔离环境中，可以从首次打开 Zora 开始，完成模型配置，进入 Awakening，并最终进入主界面。

这是当前最重要的 L3 GUI 发版剧本。

## 前置条件

- 使用隔离 HOME，不读取开发者真实 `~/.zora`。
- 测试运行目录由 `scripts/gui-start-case.sh` 创建。
- 如果要完成真实 SDK 调用，需要提供一个可用 Provider。Provider 来源可以是：
  - Codex 从用户允许的本机配置中读取，并只在隔离 HOME 中使用。
  - 环境变量 `ZORA_GUI_PROVIDER_CONFIG`。
  - 用户在 GUI 中临时输入。

真实调用需要完整 Provider 信息，包括 API key、baseUrl 和 model。它们只能存在于本次隔离 `home/.zora` 中。报告中禁止写入明文 API key；baseUrl 可以记录，用于排查 Provider 路由。

## 启动

```bash
bun run test:gui:init:local-provider
```

Codex 使用 Computer Use 选择 `Electron` 窗口。

## 步骤

### 1. 首次启动检查

动作：

- 打开 Electron 窗口。
- 观察首屏。

通过标准：

- 不直接进入已有用户的主界面。
- 显示模型/Provider 配置引导。
- 当前运行目录指向 `tests/.artifacts/gui/runs/<run-id>/home`。

记录：

- 首屏截图。
- `home/.zora` 初始文件结构。

### 2. 模型配置

动作：

- 选择 Provider 类型。
- 填写名称、Base URL、API Key、模型 ID。
- 点击保存或连接。

通过标准：

- 必填项校验清晰。
- 保存成功后 Provider 出现在配置中。
- `home/.zora/providers.json` 被写入隔离目录。
- 报告中 API key 必须脱敏。

### 3. 进入 Awakening

动作：

- 配置完成后继续。
- 观察是否进入 Awakening 对话。

通过标准：

- Zora 不应跳过必要的首次体验。
- UI 明确告诉用户现在处于首次认识/唤醒阶段。
- 输入框可用。

### 4. 首轮 Awakening 对话

动作：

- 发送一条真实用户自我介绍，例如：

```text
你好，我是测试用户。我希望 Zora 了解我如何工作。
```

通过标准：

- Zora 发起真实 SDK 调用。
- UI 有等待/流式/状态反馈。
- 收到自然、非空、符合身份的回复。
- 不出现内部 SDK 错误、堆栈或 `/login`。

### 5. 主界面结构检查

动作：

- 对话完成后观察主界面。
- 检查侧边栏、session、输入框、设置入口。

通过标准：

- session 出现在列表中。
- 输入框仍可继续对话。
- 设置入口可打开。
- 主界面没有明显空白、错位或卡死。

### 6. 文件现场检查

动作：

- 查看 `home/.zora`。

通过标准：

- Provider、session、zora 文件写入隔离 `.zora`。
- 项目根目录没有生成 `MEMORY.md`、`USER.md`、`SOUL.md` 或 `memory/`。

## 报告模板

报告路径：

```text
tests/.artifacts/gui/runs/<run-id>/report.md
```

报告必须包含：

```markdown
# L3-INIT-001 初始化 GUI 巡检报告

- Result: PASS / PARTIAL PASS / FAIL
- Run ID:
- Commit:
- Provider: <name, masked>
- HOME:

| Step | Observation | Result |
|------|-------------|--------|
| 首次启动 | ... | PASS |
| 模型配置 | ... | PASS |
| Awakening | ... | PASS |
| 首轮对话 | ... | PASS |
| 主界面 | ... | PASS |
| 文件现场 | ... | PASS |

## Findings

- [P0/P1/P2] ...

## Recommendation

- Ship / Do not ship / Ship with known risk
```

## 清理要求

巡检结束后必须运行：

```bash
bun run test:gui:clean
```

通过标准：

- `tests/.artifacts/gui/runs/<run-id>/home` 已删除。
- 报告、截图和必要日志保留。
- 项目根目录没有生成 `MEMORY.md`、`USER.md`、`SOUL.md` 或 `memory/`。
