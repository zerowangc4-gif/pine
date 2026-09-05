# Pine

本地 coding-agent 桌面应用（Tauri + React + Node sidecar）。

## 架构主线

```
UI → desktop/socket → @pine/socket-client → protocol
  → @pine/socket-server → runtime/socket → session → agent.ts
```

每条协议线的 **文件流转** 见 [test.md](./test.md)。UI e2e 在 [e2e/](./e2e/)。

## 常用命令

```bash
pnpm install
pnpm dev:runtime    # sidecar
pnpm dev:ui         # 浏览器里开网页（Vite）
pnpm dev:tauri      # 桌面窗口开发
pnpm build:tauri    # 打包 exe（含 sidecar）
pnpm test:ui        # Playwright UI 冒烟（需 DEEPSEEK_API_KEY；自动装 Chromium）
pnpm check          # Biome lint + format
```
