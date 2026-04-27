# Release Smoke

发版前 L3 GUI Product Review 先跑少量核心剧本。目标不是穷尽所有边界，而是确认新用户能从零开始走到 Zora 主界面，并且核心 Agent 体验没有明显断裂。

## 必跑剧本

| Case | 标题 | 状态 |
|------|------|------|
| `L3-INIT-001` | 初始化：模型配置 → 唤醒 → 主界面 | active |

## L3-INIT-001 总目标

验证一个全新用户在隔离环境中可以完成：

1. 启动 Zora。
2. 看到模型配置引导。
3. 配置一个可用 Provider。
4. 进入 Awakening 唤醒流程。
5. 发送首轮自我介绍消息。
6. 收到 Zora 的自然回复。
7. 进入主界面并看到 session / chat / 设置等基础结构。
8. 本次运行的文件都写入隔离的 `home/.zora`，不污染开发者真实环境。

详细步骤见 `cases/init-model-awakening.md`。

## 执行入口

```bash
bun run test:gui:init
```

启动后由 Codex 通过 Computer Use 接管 `Electron` 应用窗口。

## 产物要求

每次执行都要生成：

```text
tests/.artifacts/gui/runs/<run-id>/
├── home/.zora/
├── logs/
├── screenshots/
└── report.md
```

`report.md` 必须包含：

- 执行时间和 commit 信息。
- Provider 来源，必须脱敏。
- 每一步的观察结果。
- 发现的问题和严重程度。
- 是否建议发版。
