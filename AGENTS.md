# Pine 项目开发指南（AI 编程助手必读）

本文件是给 AI 编程助手（以及新接手的人）的项目约定。写代码前先读完本文件，涉及 SDK 接口时以本文件第 2、3 节指向的文档为准。

## 0. 宪法（不可妥协）

每次动手前、每次完工后，必须反复问三句话：

1. **谁会用？** —— 没有使用理由的功能不加，宁可少而精。想清楚「他为什么用、操作顺不顺」。
2. **代码极致干净？** —— 单一职责、命名清晰、无死代码/死导入、无重复、不硬编码颜色/间距/文案。改完必须过 `typecheck` + `lint`（涉及 main/preload 再 `electron-vite build`），全绿才算完。
3. **架构干净？** —— 功能按 feature 分层；跨进程只走 `shared/types.ts`（类型）+ `shared/ipc.ts`（channel）+ `preload` 桥接；主进程 SDK 能力只从 `src/main/core/pi.ts` 导入；能力走 skills/extensions，不写死提示词。

硬性红线（违反即重做）：
- UI 状态只在 Redux（内存），不落盘；用户数据（会话）才持久化。
- 新增 IPC 能力走五步：types → ipc channel → preload → main handler/logic → renderer saga + 双语 i18n。
- 改了能力/约定，同步更新 `AGENTS.md` 与 `docs/DESIGN_NOTES.md`。
- 主进程不得直接 import SDK 包，渲染层不得 import SDK。

## 1. 项目是什么

Pine 是一个 Electron 桌面端，把 `@earendil-works/pi-coding-agent`（Pi 编码助手 SDK）嵌进自定义 UI：登录选模型 → 打开文件夹 → 与助手对话，助手能用 read/bash/edit/write 工具在那个文件夹里工作。

技术栈：

- Electron + electron-vite（桌面壳与构建）
- React 19 + TypeScript（渲染层）
- Redux Toolkit + redux-saga（状态与副作用）
- styled-components + ThemeProvider（样式，主题 token 见 `apps/desktop/src/renderer/theme/theme.ts`）
- i18next + react-i18next（zh-CN / en-US）
- react-router-dom（HashRouter，`/login`、`/chat`）
- `@earendil-works/pi-coding-agent` v0.85.1（只运行在**主进程**）

## 2. 文档位置（先读这些）

### 2.1 本项目自带文档

- **SDK 接口文档**：`docs/sdk-api-reference.md`（完整 API、入参/返回、以及"如何不加载 Pi 默认配置"的逐项对照表）。同名 `.html` 是网页版，内容相同。
- **架构交接文档**：`apps/desktop/README.md`（目录结构、进程数据流、约定、命令、关键流程）。

### 2.2 SDK 官方文档（随包安装，最权威）

安装在 pnpm 软链下，稳定路径：

```
apps/desktop/node_modules/@earendil-works/pi-coding-agent/
  docs/sdk.md              ← SDK 总览，必读
  docs/extensions.md       ← 扩展 API（注册工具/命令/事件）
  docs/models.md           ← 模型目录与解析
  docs/settings.md         ← 设置项
  docs/sessions.md         ← 会话管理（SessionManager / 树）
  docs/rpc.md              ← RPC 模式
  docs/session-format.md   ← 会话 .jsonl 格式
  examples/sdk/01-minimal.ts … 13-session-runtime.ts  ← 官方示例
  dist/index.d.ts          ← 类型定义，API 入参/返回的最终依据
  dist/index.js            ← 入口
```

写任何 SDK 调用前，先打开 `docs/sdk.md` 对应小节和 `dist/index.d.ts` 核对类型，不要凭记忆猜。`@earendil-works/pi-ai` 的类型（`Model`、`Context`、`Message` 等）在同级的 `@earendil-works/pi-ai/dist/` 下。

## 3. SDK 使用要点（本项目内的固定用法）

### 3.1 铁律：SDK 只在主进程用

`@earendil-works/pi-coding-agent` 依赖 Node 能力（fs/path/net），**只能在 `src/main/**` 里 import**。渲染层（`src/renderer/**`）绝不能 import SDK，只能通过 `window.pi` 桥（见 `src/shared/types.ts` 的 `Pi` 接口、`src/shared/ipc.ts` 的 channel 常量、`src/preload/index.ts` 的实现）。

### 3.2 不加载 Pi 默认配置（本项目硬性要求）

Pi 默认会读 `~/.pi/agent/` 下的 settings.json / auth.json / models.json / SYSTEM.md / AGENTS.md / extensions / skills 等。本项目作为桌面端**必须零默认配置**，标准写法（已在 `src/main/services/pine-service.ts` 中落实，照抄即可）：

```typescript
import { ModelRuntime } from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";

// 1) 模型运行时：内存凭证 + 不读 models.json（目录缓存自动内存）
const runtime = await ModelRuntime.create({
  credentials: new InMemoryCredentialStore(),
  modelsPath: null,
});

// 2) 运行时注入 API key，不落盘
await runtime.setRuntimeApiKey(provider, apiKey);

// 3) 会话：内存会话 + 内存设置 + 自定义 ResourceLoader（零磁盘发现）
const { session } = await createAgentSession({
  cwd: root,                  // 打开的文件夹，工具作用域
  agentDir: root,             // 传了自定义 loader 后不再参与发现
  model,                      // runtime.getModel(provider, modelId) 的结果
  thinkingLevel: "medium",
  modelRuntime: runtime,
  resourceLoader: createMinimalResourceLoader(),   // 见 pine-service.ts
  sessionManager: SessionManager.inMemory(root),
  settingsManager: SettingsManager.inMemory({ compaction: { enabled: false } }),
});
```

`createMinimalResourceLoader()` 是一个实现了 `ResourceLoader` 接口（10 个方法，见 `dist/index.d.ts`）的空实现，唯一非空的是 `getSystemPrompt()`。它保证不读 SYSTEM.md / AGENTS.md / extensions / skills / prompts / themes。

### 3.3 选模型 / 调模型

```typescript
const runtime = await ModelRuntime.create({ credentials, modelsPath: null });

runtime.getProviders()                    // 所有内置 provider（含 name、auth.apiKey/oauth）
runtime.getModels(providerId)             // 该 provider 的全部模型（静态目录，无需网络）
runtime.getModel(providerId, modelId)     // 单个模型；不存在返回 undefined
runtime.setRuntimeApiKey(provider, key)   // 注入 key（内存）
runtime.hasConfiguredAuth(provider)       // 是否已配置凭证
runtime.completeSimple(model, context, { signal })  // 单次请求，返回 AssistantMessage
```

`Context` 形状（来自 pi-ai）：

```typescript
const context = {
  systemPrompt: "You are a connectivity check.",
  messages: [{ role: "user", content: "ping", timestamp: Date.now() }],
};
```

`completeSimple` 返回的 `AssistantMessage` 有 `stopReason`（`"stop" | "error" | "aborted" | …`）和 `errorMessage`。校验 key 是否有效时用 `stopReason` 判断，而不是只靠是否抛异常。

### 3.4 会话与事件流

```typescript
const { session } = await createAgentSession({ /* 3.2 的选项 */ });

session.subscribe((event) => {
  // event.type 见 AgentSessionEvent（dist/index.d.ts）
  // 本项目用到的：agent_start、message_start(role==="assistant")、
  //   message_update(assistantMessageEvent.type==="text_delta"/"thinking_delta")、
  //   message_end(role==="assistant")、tool_execution_start、tool_execution_end、
  //   agent_settled
});

await session.prompt("帮我重构这个文件");   // 流式中再次 prompt 会抛错，需用 steer/followUp
session.isStreaming;                        // 是否正在生成
await session.abort();                      // 中止
session.dispose();                          // 用完销毁
```

本项目把 `AgentSessionEvent` 归约成 `ChatEvent`（`src/shared/types.ts`）通过 IPC 推给渲染层，渲染层在 `src/renderer/features/chat/store/slice.ts` 里归约成消息列表。**新增 SDK 事件处理时，改这三处：`pine-service.ts` 的 `forwardEvent`、`shared/types.ts` 的 `ChatEvent`、chat slice 的 reducer。**

## 4. 代码结构（必须遵守）

```
apps/desktop/src/
  shared/                 跨进程共享：types.ts / ipc.ts / errors.ts / utils.ts
  main/                   主进程（Node）
    index.ts              入口：建窗口 + 组装
    core/pi.ts            **唯一** SDK 导出入口（按分类再导出）
    ipc/                  薄壳 ipcMain handler：providers / files / chat / sessions / system
    services/pine-service.ts   PineService 类：runtime + 连接 + 工作目录 + 会话
  preload/index.ts        暴露 window.pi
  renderer/
    main.tsx / ThemedRoot.tsx / App.tsx    入口 + 主题注入 + 路由守卫
    theme/                theme.ts（dark/light 两个主题，spaces+colors）+ GlobalStyle
    i18n/                 i18next 初始化 + zh-CN / en-US 语言包
    components/           Dropdown / Modal / icons / LanguageSwitcher / ThemeSwitcher
    utils/                id / path / error
    store/                Redux store + rootSaga + themeSlice + layoutSlice
    features/
      login/              登录 / 模型切换
      workspace/          文件树 + 编辑器
      chat/               聊天 / 会话 / 会话设置
```

**每个 feature 固定形状**：

```
features/<name>/
  types/state.ts      该 feature 的 Redux state 类型
  store/slice.ts      createSlice（reducers + actions）
  store/saga.ts       window.pi 副作用
  store/index.ts      再导出 slice + saga
  components/ 或 pages/   纯 UI 组件
  index.ts            feature 对外导出
```

新增 feature 时照着 `login` / `workspace` / `chat` 抄结构，并在 `store/index.ts`（挂 reducer）和 `store/rootSaga.ts`（挂 saga）注册。

## 5. 硬性约定

### 5.1 IPC 与跨进程类型

- 新增 IPC 方法流程：`shared/types.ts` 的 `Pi` 接口加方法 → `shared/ipc.ts` 加 channel → `preload/index.ts` 桥接 → `main/ipc/<域>.ts` 写 handler → 渲染层 saga 调用。
- **channel 名只能用 `shared/ipc.ts` 里的常量**，禁止主进程/preload 各自写字符串。
- 跨进程传的都是 `shared/types.ts` 里的纯 JSON 类型。

### 5.2 状态管理

- 触发异步的 action 叫 `*Request`（空 reducer，payload 带输入）；结果叫 `*Success` / `*Failure`。
- reducer 必须纯；id 用 `utils/id.ts` 的 `createId()`（`crypto.randomUUID`），不允许在 reducer 里做副作用。
- saga 不 import `useTranslation`；它存 i18n key 或原始错误串，UI 在渲染时翻译。

### 5.3 错误处理

- 主进程对已知失败返回 i18n key（`shared/errors.ts` 的 `AppError`，如 `error.noFolder`），未知错误返回原始技术信息（`toErrorMessage`，`shared/utils.ts`）。
- 渲染层展示错误统一走 `utils/error.ts` 的 `errorText()`：是 key 就翻译，否则原文透传。
- 新增错误码：`shared/errors.ts` 加常量 + 两个语言包的 `error.*` 命名空间都加。

### 5.4 样式与主题

- **禁止硬编码颜色与间距**：颜色用 `theme.colors.*`，距离/内边距/间隙用 `theme.spaces["…"]`（Tailwind 风格 scale：`1`=4px、`4`=16px…，见 `theme/theme.ts`）。
- 只有两个主题：`dark`（默认）/ `light`，由 `theme/theme.ts` 的 `themes` / `getTheme()` 提供；切换走 `ThemeSwitcher`（Redux `theme` slice，仅内存，不持久化）。
- 新 token 必须先改 `Theme` 接口（契约），再补两个主题各自的值。
- 图标只放在 `components/icons.tsx`（SVG 组件 + `Spinner`），其他地方不要重复写 SVG。

### 5.5 核心包导出收敛

- 主进程用到的 Pi SDK 能力**必须**从 `src/main/core/pi.ts` 一个文件导入，不要直接 import 包。新增 SDK 能力时先在该文件补导出。

### 5.6 国际化

- 所有用户可见文案走 `useTranslation()` 的 `t("feature.key")`，**禁止硬编码中文/英文**。
- 每个 key 必须同时加到 `i18n/locales/zh-CN.json` 和 `en-US.json`。

### 5.7 通用

- 命名清晰、单一职责；无用的代码/导入直接删，不留死代码。
- 通用工具放 `renderer/utils/` 或 `shared/utils.ts`（跨进程时），不复制粘贴。
- 新增依赖用 `pnpm --filter @pine/desktop add <pkg>`，保持精确版本。

## 6. 验证命令

```bash
# 从仓库根目录（E:\agents\pine）
pnpm --filter @pine/desktop typecheck     # 或：cd apps/desktop && npx tsc --noEmit
npx eslint apps/desktop/src               # lint
cd apps/desktop && npx electron-vite build   # 构建（验证 bundling 无错）
pnpm dev                                   # 本地跑
```

改完代码至少跑 **typecheck + lint**，都过了才算完成。`electron-vite build` 在改动 main/preload（涉及 SDK 外部化、新依赖）后要跑一次确认。

## 7. 常见任务速查

- **加一个会话事件到聊天 UI**：改 `pine-service.ts` 的 `forwardEvent` → `shared/types.ts` 的 `ChatEvent` → chat slice reducer →（如需展示）`ChatView.tsx`。
- **加一个文件操作**：`files.ts` 里加 handler（注意 `resolveWithinRoot` 校验路径不越出工作目录）→ `ipc.ts` / `preload` / `shared/types.ts` → workspace saga。
- **加一个 feature**：按第 4 节结构建目录，注册 reducer + saga。
- **加一个 UI 字符串**：两个语言包都加，组件里 `t(...)`。
- **加一个可复用的 UI 组件**：放 `renderer/components/`，样式用 theme。

## 8. 不要做的事

- 不要在渲染层 import `@earendil-works/pi-coding-agent` 或 `@earendil-works/pi-ai`。
- 不要用 `window.prompt` / `window.alert`（Electron 不支持或很丑）；用 `components/Modal.tsx`。
- 不要加载 Pi 的 `~/.pi/agent` 默认配置（见 3.2）。
- 不要在主进程硬编码用户可见的中文/英文；用 `AppError` / i18n key。
- 不要绕过 `shared/ipc.ts` 手写 channel 字符串。
