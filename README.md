
# ZoraAgent

**有灵魂的桌面 AI 伴侣**

基于 Claude Agent SDK 构建的桌面级 AI 伴侣应用，  
让每一个 AI 都拥有独特的人格、持久的记忆和更真实的陪伴感。
---

## 目录

- [什么是 Zora](#什么是-zora)
- [功能亮点](#功能亮点)
- [应用截图](#应用截图)
- [架构设计](#架构设计)
- [项目结构](#项目结构)
- [快速开始](#快速开始)
- [配置说明](#配置说明)
- [数据目录](#数据目录)
- [技术栈](#技术栈)
- [工作原理](#工作原理)
- [参与贡献](#参与贡献)
- [许可证](#许可证)

---

## 什么是 Zora

Zora 不只是一个聊天窗口，它更像一个会持续成长的 AI 伴侣。

大多数 AI 应用在关闭窗口后就失去了上下文，下一次打开时只能重新开始。Zora 试图解决这个问题：它会逐步形成自己的设定、记住你的偏好、沉淀长期记忆，并把这些信息持续带入之后的对话里。通过唤醒流程、结构化记忆、会话恢复和技能系统，Zora 更接近一个真正长期协作的数字伙伴，而不只是一次性工具。

核心理念：**让 AI 不只是工具，而是真正能陪你长期协作的伙伴。**

---

## 功能亮点

### 觉醒系统（Awakening）

首次进入时，Zora 会通过一段引导式自然对话完成“唤醒”。在这个过程中，它会逐步生成 `SOUL.md`、`IDENTITY.md` 和 `USER.md`，建立自己的行为风格、身份设定和用户画像，让每个实例都带着独特的起点进入后续对话。

### 结构化记忆

Zora 采用分层记忆结构：`SOUL`、`IDENTITY`、`USER`、`MEMORY` 加上按日期归档的 `memory/YYYY-MM-DD.md` 日志。对话结束后，后台 Memory Agent 会自动提取高价值信息并写入长期记忆。支持三种模式：

- **Immediate**：对话结束后延迟处理
- **Batch**：按空闲时间批量处理
- **Manual**：由用户手动触发

### 会话持久化与恢复

会话消息会落盘保存，本地维护独立的 session 数据。当 Claude SDK 的 session 丢失或不可恢复时，Zora 会从本地历史记录重建上下文，尽量无缝继续当前对话。

### 工作区与文件树

Zora 支持多工作区管理。每个工作区都可以绑定自己的会话历史和本地目录，并通过侧边栏文件树浏览内容，方便把 AI 协作和真实项目目录连接起来。

### 三级权限控制（HITL）

- **Ask**：每次敏感工具调用前都询问
- **Smart**：只对有风险的操作询问，安全读操作自动放行
- **Yolo**：全部放行

这套权限系统让桌面 Agent 既能保持执行力，也能在真实工作流里更可控。

### 多 Provider 架构

当前支持 6 种 Provider：**Anthropic / 火山引擎 / 智谱 / Moonshot / DeepSeek / 自定义**。  
每个 Provider 支持主模型和 4 个角色模型映射：

- `smallFast`
- `sonnet`
- `opus`
- `haiku`

所有敏感凭证直接写入本地配置文件，避免触发 macOS 钥匙串弹窗。

### 飞书深度集成

Zora 可通过飞书桥接能力进入团队协作场景，支持：

- WebSocket 长连接
- 新建会话与会话绑定
- 交互卡片消息
- 任务状态反馈
- 斜杠命令：`/help`、`/new`、`/stop`、`/status`

### 技能生态系统

技能使用 Markdown 定义，并支持从多个外部工具自动发现和导入技能。目前支持扫描：

- Claude Code
- Codex CLI
- OpenCode
- Gemini CLI
- Agents Shared

可通过 `symlink` 或复制导入到 Zora 自己的技能目录，实现跨工具技能复用。

### MCP 集成

除了可手动配置 `stdio / http / sse / sdk` 类型的 MCP Server，Zora 还内置了两类实用 MCP 能力：

- **Web Search**：基于 Tavily
- **Web Fetch**：基于 Jina Reader

适合补足时效性信息、网页抓取和链接内容读取场景。

### 富文本与附件对话

聊天界面支持：

- Markdown 渲染
- GFM 表格、任务列表等语法
- 代码高亮
- Mermaid 图表
- 附件输入与图片预览

适合技术讨论、方案设计和项目协作等重内容场景。

---

## 应用截图

> 截图待补充。
>
> 建议后续补充这些画面：
>
> - 主对话界面
> - 唤醒引导流程
> - 设置面板
> - 飞书集成效果
> - 工作区与文件树

---

## 架构设计

Zora 采用 Electron 的主进程 / 预加载 / 渲染进程三层结构，通过 `contextBridge` 暴露受控 API，兼顾能力与安全性。

```text
┌────────────────────────────────────────────────────────────┐
│                     Renderer (React)                       │
│        Chat / Awakening / Settings / Sidebar / FileTree    │
│                 Jotai + Tailwind CSS v4                    │
└───────────────────────┬────────────────────────────────────┘
                        │ IPC via contextBridge
┌───────────────────────▼────────────────────────────────────┐
│                     Preload Bridge                         │
│              window.zora API 安全暴露给前端                │
└───────────────────────┬────────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────────┐
│                        Main Process                        │
│  Agent Runner / Prompt Builder / Provider Manager         │
│  Memory Agent / Session Store / Workspace Store           │
│  Skill Manager / MCP Manager / Feishu Bridge / HITL       │
└───────────────────────┬────────────────────────────────────┘
                        │
┌───────────────────────▼────────────────────────────────────┐
│                    Local Persistent Data                   │
│   ~/.zora/providers.json / mcp.json / zoras/ / workspaces/ │
└────────────────────────────────────────────────────────────┘
```

**关键设计取舍：**

| 选择 | 原因 |
|------|------|
| Bun | 更快的安装与脚本执行体验 |
| Electron | 提供桌面能力、文件访问和系统级集成 |
| esbuild 构建主进程 | 构建速度快，适合 Electron 主进程场景 |
| Vite 构建渲染进程 | 启动快、HMR 流畅 |
| Jotai | 原子化状态管理，适合复杂桌面 UI |
| `contextBridge` | 控制渲染进程暴露能力，减少直接 Node 访问 |
| 本地文件存储 | 将 API Key 与敏感配置直接保存在本地配置文件中，避免依赖系统钥匙串 |

---

## 项目结构

```text
ZoraAgent/
├── AGENT.md
├── CLAUDE.md
├── LICENSE
├── package.json
├── bun.lock
├── tsconfig.json
├── vite.config.ts
├── esbuild.config.ts
├── electron-builder.yml
├── skills/
│   └── bootstrap/
│       ├── SKILL.md
│       ├── references/
│       └── templates/
├── src/
│   ├── main/
│   │   ├── index.ts                # Electron 主进程入口与 IPC 注册
│   │   ├── agent.ts                # Claude Agent SDK 运行封装
│   │   ├── prompt-builder.ts       # 系统提示词组装
│   │   ├── productivity-runner.ts  # 日常会话执行与恢复
│   │   ├── provider-manager.ts     # Provider 管理与本地配置存储
│   │   ├── memory-agent.ts         # 后台记忆提取代理
│   │   ├── memory-store.ts         # Zora 记忆文件读写
│   │   ├── session-store.ts        # 本地会话消息持久化
│   │   ├── workspace-store.ts      # 工作区管理
│   │   ├── skill-manager.ts        # 技能加载与导入
│   │   ├── skill-discovery.ts      # 外部工具技能发现
│   │   ├── hitl.ts                 # 权限询问与 AskUser 交互
│   │   ├── mcp-manager.ts          # MCP 配置、连接与内置能力
│   │   ├── builtin-mcp/            # 内置 Web Search / Web Fetch
│   │   ├── feishu/                 # 飞书桥接
│   │   └── query-profiles/         # productivity / awakening / memory
│   ├── preload/
│   │   └── index.ts
│   ├── renderer/
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   ├── components/
│   │   │   ├── awakening/
│   │   │   ├── chat/
│   │   │   ├── filetree/
│   │   │   ├── layout/
│   │   │   ├── settings/
│   │   │   ├── sidebar/
│   │   │   └── ui/
│   │   ├── store/
│   │   ├── styles/
│   │   ├── types/
│   │   └── utils/
│   ├── shared/
│   │   ├── zora.d.ts
│   │   └── types/
│   └── types/
└── dist/
```

---

## 快速开始

### 前置要求

- **Bun** 1.3+（仓库当前使用 `bun@1.3.10`）
- **Node.js** 20+
- **Git**
- 至少一个可用的 Provider API Key

### 安装与启动

```bash
# 1. 克隆仓库
git clone https://github.com/Hoshea7/ZoraAgent.git
cd ZoraAgent

# 2. 安装依赖
bun install

# 3. 启动开发环境
bun run dev
```

首次启动后，进入应用内的 **设置 → 模型配置** 添加 Provider。完成后即可开始对话；如果当前 Zora 还未初始化，会先进入唤醒流程。

### 常用命令

```bash
# 启动开发模式
bun run dev

# 仅构建主进程
bun run build:main

# 仅构建渲染进程
bun run build:renderer

# 生产构建并打包到 release/
bun run build

# TypeScript 类型检查
bun run typecheck
```

---

## 配置说明

### 1. 模型配置

在 **设置 → 模型配置** 中可以：

- 添加或编辑 Provider
- 配置 API Key / Base URL / 默认模型
- 配置 `smallFast / sonnet / opus / haiku` 角色模型
- 测试连通性
- 设置默认 Provider

### 2. 记忆设置

在 **设置 → 记忆** 中可以：

- 选择记忆模式：Immediate / Batch / Manual
- 配置 Batch 模式的空闲时间
- 指定独立的记忆 Provider / 模型，降低长期运行成本

### 3. 飞书设置

在 **设置 → 飞书** 中可配置飞书接入信息，并启用桌面端与飞书之间的消息桥接。

### 4. 技能管理

在 **设置 → 技能** 中可以扫描外部技能目录，并把技能导入到 Zora 的全局技能目录中。

### 5. MCP 设置

在 **设置 → MCP** 中可以：

- 启用内置 `Web Search` / `Web Fetch`
- 配置对应的 Tavily / Jina Key
- 手动添加或编辑自定义 MCP Server

---

## 数据目录

Zora 会把运行数据存储在 `~/.zora/` 下，方便长期记忆与会话管理。

```text
~/.zora/
├── providers.json                # Provider 配置（明文保存在本地）
├── feishu-config.json            # 飞书配置（明文保存在本地）
├── memory-settings.json          # 记忆模式设置
├── mcp.json                      # MCP 配置
├── workspaces.json               # 工作区元数据
├── skills/                       # Zora 全局技能目录
├── .claude-plugin/
│   └── plugin.json               # Claude Agent SDK 插件清单
├── workspaces/
│   └── {workspaceId}/
│       └── sessions/
│           ├── index.json
│           ├── {sessionId}.jsonl
│           └── attachments/
└── zoras/
    └── default/
        ├── SOUL.md
        ├── IDENTITY.md
        ├── USER.md
        ├── MEMORY.md
        └── memory/
            └── YYYY-MM-DD.md
```

---

## 技术栈

| 分类 | 技术 |
|------|------|
| 运行时 | Electron 39 |
| 包管理 | Bun 1.3 |
| AI 核心 | Claude Agent SDK 0.2.x |
| 前端框架 | React 18.3 |
| 状态管理 | Jotai 2.12 |
| 样式方案 | Tailwind CSS v4 |
| 主进程构建 | esbuild |
| 渲染进程构建 | Vite 7 |
| 语言 | TypeScript 5.8 |
| 富文本渲染 | react-markdown + remark-gfm |
| 目录增强 | rehype-slug + rehype-autolink-headings + remark-toc |
| 图表 | Mermaid |
| 代码高亮 | react-syntax-highlighter |
| UI 基础组件 | Radix UI |
| 飞书集成 | `@larksuiteoapi/node-sdk` |
| 打包分发 | electron-builder |

---

## 工作原理

### 1. 首次唤醒

```text
首次启动
  → 检测是否已完成基础设定
  → 未完成则进入 Awakening Profile
  → 通过引导对话生成基础人格与用户画像
  → 保存到 ~/.zora/zoras/default/
  → 切换到日常对话模式
```

### 2. 日常对话

```text
用户输入
  → Renderer 收集消息 / 附件 / 当前会话信息
  → 通过 preload 暴露的 IPC API 发送到 Main
  → productivity-runner 选择工作区与 session
  → prompt-builder 组装系统提示词
     [SOUL] + [IDENTITY] + [USER] + [技能说明] + [MEMORY] + [最近日志]
  → Claude Agent SDK 执行
  → 流式消息返回前端实时渲染
  → 会话记录落盘保存
```

### 3. 会话恢复

```text
已存在本地会话
  → Claude SDK session 丢失或失效
  → 从本地消息历史中截取恢复上下文
  → 构造 recovered prompt
  → 重新拉起新的 SDK session
  → 尽量继续原对话
```

### 4. 记忆提取

```text
对话结束
  → MemoryAgent 入队
  → 根据设置选择 Immediate / Batch / Manual
  → 读取 MEMORY.md + USER.md + 最近对话摘要
  → 启动独立 memory profile（maxTurns = 7）
  → 更新 MEMORY.md / USER.md / memory/YYYY-MM-DD.md
```

---

## 参与贡献

欢迎 Issue、PR 或任何形式的建议。下面这些方向都很适合继续完善：

- 更多 Provider 适配
- 更多内置技能与技能市场能力
- MCP 使用体验与生态兼容
- 飞书交互体验打磨
- 桌面端 UI/UX 细节优化
- 国际化支持
- 文档、示例与截图补充

### 开发提示

- 修改主进程后通常需要重新启动应用
- 修改渲染进程后，Vite HMR 会自动刷新
- 开发模式下 Electron 使用远程调试端口 `9222`
- 提交前建议运行 `bun run typecheck`

---

## 许可证

本项目基于 [MIT License](./LICENSE) 开源。

Copyright © 2026 [Hoshea7](https://github.com/Hoshea7)
