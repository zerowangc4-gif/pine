# Pine Desktop

Electron 桌面端编码助手：连接模型 → 打开文件夹 → 与助手对话，助手通过 `read / bash / edit / write` 工具在项目目录内工作。

> **完整开发文档见 [`docs/DEVELOPMENT.html`](../../docs/DEVELOPMENT.html)**（架构、目录、规范、关键流程、功能地图、质量门）。本文只保留最小入口。

## 技术栈

- Electron 37 + electron-vite 4
- React 19 + TypeScript 5.9
- Redux Toolkit + redux-saga
- styled-components + ThemeProvider
- i18next + react-i18next（zh-CN / en-US）
- `@earendil-works/pi-coding-agent` 0.85.1（仅在主进程运行）

## 运行与验证

```bash
# 从仓库根目录（E:\agents\pine）
pnpm install        # 安装依赖
pnpm dev            # 本地运行
pnpm typecheck      # 类型检查
pnpm lint           # eslint + prettier
pnpm build          # 生产构建（main / preload / renderer）
```

改完代码至少跑 `typecheck` + `lint`；改动 main / preload 后再跑 `build` 确认 bundling。

## 架构速览

```
renderer (React + Redux + saga)
   │  window.pi.*        类型化桥（src/shared/types.ts）
   ▼
preload (contextBridge)   src/preload/index.ts
   │  ipcRenderer.invoke  channel 常量（src/shared/ipc.ts）
   ▼
main (Node)               src/main/  → PineService → @earendil-works/pi-coding-agent
```

- 渲染层不碰 Node API / SDK，只走 `window.pi`。
- SDK 能力只从 `src/main/core/pi.ts` 导入。
- 跨进程只传 `src/shared/types.ts` 里的纯 JSON 类型。

## 文档索引

| 文档 | 内容 |
| --- | --- |
| [`docs/DEVELOPMENT.html`](../../docs/DEVELOPMENT.html) | 唯一开发入口（架构 / 规范 / 流程 / 功能地图） |
| [`docs/sdk-api-reference.html`](../../docs/sdk-api-reference.html) | Pi SDK 接口详解 |
| [`AGENTS.md`](../../AGENTS.md) | AI 助手与协作者的约定（宪法） |
| SDK 官方文档 | `node_modules/@earendil-works/pi-coding-agent/docs/` |
