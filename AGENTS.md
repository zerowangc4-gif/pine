# Pine 项目开发指南（AI 编程助手必读）

写代码前先读完本文件。涉及 SDK 接口时，以 `docs/DEVELOPMENT.html` 与 `docs/sdk-api-reference.html` 为准。

## 1. 项目架构

Pine 是一个 Electron 桌面端，把 `@earendil-works/pi-coding-agent`（Pi 编码助手 SDK）嵌进自定义 UI：登录选模型 → 打开文件夹 → 与助手对话，助手用 read/bash/edit/write 等工具在那个文件夹里工作。

技术栈：Electron + electron-vite；React 19 + TypeScript；Redux Toolkit + redux-saga；styled-components；i18next（zh-CN / en-US）；react-router-dom（HashRouter）；`@earendil-works/pi-coding-agent` v0.85.1（只在**主进程**运行）。

```
apps/desktop/src/
  shared/                 跨进程共享：types.ts / ipc.ts / errors.ts / utils.ts
  main/                   主进程（Node）
    index.ts              入口：建窗口 + 组装
    core/                 pi.ts（唯一 SDK 导出入口）+ prompt.ts + index.ts
    ipc/                  薄壳 ipcMain handler（providers / files / chat / sessions / system）
    services/             FileService、PineService、messages、resources、tool-permission-gate + index.ts
  preload/index.ts        暴露 window.pi
  renderer/
    main.tsx / ThemedRoot.tsx / App.tsx    入口 + 主题注入 + 路由守卫
    theme/                theme.ts（dark/light）+ GlobalStyle + index.ts
    i18n/                 i18next 初始化 + zh-CN / en-US 语言包
    components/           Dropdown / Modal / icons / ui / 切换器 + index.ts
    utils/                error / format / id / path + index.ts
    store/                Redux store + rootSaga + theme/layout slice
    features/
      login/              登录 / 模型切换
      workspace/          文件树 + 编辑器
      chat/               聊天 / 会话 / 会话设置 / 工具权限
```

每个 feature 固定形状：

```
features/<name>/
  types/state.ts      该 feature 的 Redux state 类型
  store/slice.ts      createSlice（reducers + actions）
  store/saga.ts       window.pi 副作用
  store/index.ts      再导出 slice + saga
  components/ 或 pages/   纯 UI 组件
  index.ts            feature 对外导出
```

## 2. 代码整洁

- 命名清晰、单一职责；无死代码、死导入、重复；通用逻辑抽到 `renderer/utils/`、`shared/utils.ts` 或 `shared/`。
- 一个文件夹有多个对外导出时，必须建 `index.ts` 做桶导出（barrel），外部只 `import` 该文件夹，不直接 import 内部文件。services 尤其如此。
- 不硬编码：channel 名只用 `shared/ipc.ts` 常量；错误码只用 `shared/errors.ts` 常量；颜色/间距只用 `theme.colors.*` / `theme.spaces.*`；文案走 i18n。新增常量先在定义处补，再从桶导出。
- 新增依赖用 `pnpm --filter @pine/desktop add <pkg>`，保持精确版本。

## 3. 必须遵守的规则

- SDK 只在主进程用；渲染层不得 import SDK，只能走 `window.pi`（`shared/types.ts` 的 `Pi` 接口 + `preload` 桥）。主进程 SDK 能力只从 `main/core/pi.ts` 导入。
- 新增 IPC 能力五步：`shared/types.ts` 加类型 → `shared/ipc.ts` 加 channel → `preload` 桥接 → `main/ipc/<域>.ts` 写 handler（主进程逻辑在 service）→ 渲染层 saga + 双语 i18n。
- 零默认配置：不读 `~/.pi/agent` 下的任何配置。标准写法见 `main/services/pine-service.ts`（`ModelRuntime.create({ credentials: new InMemoryCredentialStore(), modelsPath: null })` + 内存 SessionManager/SettingsManager + 自定义 ResourceLoader）。
- UI 状态只在 Redux（内存），不落盘；用户数据（会话）才持久化。
- 触发异步的 action 叫 `*Request`，结果叫 `*Success` / `*Failure`；reducer 必须纯，id 用 `utils/id.ts` 的 `createId()`。
- 主进程已知失败返回 i18n key（`AppError`），未知错误返回原始信息（`toErrorMessage`）；渲染层统一用 `errorText()` 展示。新增错误码：`shared/errors.ts` + 两个语言包。
- 图标只放在 `components/icons.tsx`；可复用 UI 放 `components/`。
- 工具权限：内置工具（`shared/types.ts` 的 `BUILTIN_TOOLS`）全部保持可用；被关闭的工具由 `tool-permission-gate.ts` 内联扩展拦截，运行时弹窗逐次审批，不允许直接把工具从 Agent 工具集移除。只读工具（`READONLY_TOOLS`：read/grep/find/ls）永不弹窗；`edit`/`write` 弹窗带 diff 预览；`bash`/`powershell` 弹窗不展示命令内容。聊天窗口是主审阅面：`tool_start` 事件携带 `summary`（bash/powershell 为命令原文，其余为路径/搜索词）与 `diff`（edit/write 的行 diff，渲染复用 `components/FileDiff`）。
- 主进程推送事件（`onChatEvent` / `onFilesChanged` / 窗口 focus）统一在对应 feature 的 saga 里用 `eventChannel`（带 buffer）监听并转成 store action，组件里不要再手写 `window.pi.on*` 订阅。
- 改了能力/约定，同步更新 `AGENTS.md` 与 `docs/DEVELOPMENT.html`。聊天会话能力清单见 `docs/CHAT_SESSIONS.md`。

## 4. 验证命令

```bash
# 从仓库根目录（E:\agents\pine）
pnpm --filter @pine/desktop typecheck       # 类型检查
pnpm --filter @pine/desktop typecheck:e2e   # e2e 类型检查
npx eslint apps/desktop/src                 # lint
cd apps/desktop && npx electron-vite build  # 改了 main/preload 后跑
pnpm --filter @pine/desktop e2e             # 聊天会话 e2e（渲染层 + mock window.pi）
pnpm dev
```

改完代码至少过 typecheck + lint，全绿才算完成。
