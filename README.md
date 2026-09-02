# Pine

桌面 Agent（Tauri + 内嵌 Node runtime）。目标：小白机安装就能用，不必先装 Node。

## 给最终用户

安装并打开：

- 安装包：`dist/Pine_0.1.0_x64-setup.exe`
- 或绿色版：`dist/pine.exe`

填模型 / API Key（或 Ollama）即可聊天；工具 read/write/edit/bash 可用。

本机**不需要**预装 Node / pnpm。安装包已内嵌 runtime。

## 开发者

需要 Node.js >= 22.19。

```bash
cd E:\agents\pine
pnpm install
pnpm prepare:sidecar   # 打包 runtime + 拷贝 node.exe
pnpm dev:runtime       # 可选：单独跑 sidecar
pnpm dev:ui            # 浏览器调试 UI
```

打 exe（需 Rust + VS Build Tools）：

```bash
pnpm build:tauri
```

产物在 `dist/`（构建脚本也会写到 cargo target，再复制到这里）。

### Ollama

- Base URL: `http://127.0.0.1:11434/v1`
- API Key: 留空
- 模型 ID: 本地模型名

### DeepSeek

- Base URL: `https://api.deepseek.com/v1`
- 模型 ID: `deepseek-chat`

## 包结构

- `packages/telemetry` / `ai` / `agent` — 核心
- `packages/protocol` — UI ↔ runtime 协议
- `packages/runtime` — Agent sidecar（开发用 tsx；发布打成 cjs）
- `apps/desktop` — React UI + Tauri
- `apps/desktop/src-tauri/resources/runtime/` — 发布用 `node.exe` + `pine-runtime.cjs`

## 下一步

- 会话历史、文件树
- 代码签名（减少 SmartScreen 拦截）
