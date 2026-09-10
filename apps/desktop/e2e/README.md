# Pine 渲染层 E2E 测试

用 Playwright 驱动真实的 React / Redux / saga 渲染层，覆盖「聊天会话」相关 UI 能力。
`window.pi` 桥在每条测试里被 `mocks/pi.js` 替换为内存 mock，因此**无需 Electron、API key 或网络**，测试完全确定、可重复。

## 目录结构

```
e2e/
  playwright.config.ts   # Playwright 配置 + 独立 Vite dev server
  vite.config.ts         # 独立渲染层 dev server（复用 electron-vite 的 alias）
  mocks/pi.js            # window.pi 内存 mock（实现 Pi 接口全部方法）
  tests/
    helpers.ts           # mock 注入 / 连接 / 断言辅助函数
    login.spec.ts        # 登录门：渲染、连接、进入聊天页
    connection.spec.ts   # 连接：切换模型 / 快速·深度思考 / 会话内补 key
    files.spec.ts        # 工作区：打开文件夹 / 打开·编辑·保存 / 增删改 / 外部改动 diff
    sessions.spec.ts     # 会话：列出 / 加载 / 删除 / 新建 / 重命名 / 导出 / 自动压缩持久化
    chat.spec.ts         # 对话：发送 / 流式 / 复制 / 停止 / 断开 / 工具详情 / 权限弹窗
    ui.spec.ts           # 应用外壳：主题 / 语言 / 侧栏 / Markdown / 图片 / 追问·打断
```

## 运行

```bash
# 安装 Playwright 浏览器（首次）
npx playwright install chromium

# 从仓库根目录
pnpm --filter @pine/desktop e2e

# 或在 apps/desktop 目录
npx playwright test --config e2e/playwright.config.ts
```

## 工作原理

1. `webServer` 用 `vite --config e2e/vite.config.ts` 在 `127.0.0.1:5174` 提供渲染层。
2. 每条测试先 `initMockPi(page, fixtures)`：写入 `window.__PINE_E2E_INIT`，再注入 `mocks/pi.js`。
3. `mocks/pi.js` 在应用启动前把 `window.pi` 设为内存 mock，并按 fixtures 初始化会话 / 消息。
4. 测试驱动真实 UI（登录 → 连接 → 会话面板 / 输入框），断言真实渲染结果，必要时通过 `window.__pi` 检查副作用（如复制文本、导出标记）。

## 约定

- mock 必须与 `src/shared/types.ts` 的 `Pi` 接口保持一致；新增 IPC 能力时同步补 `mocks/pi.js`。
- 测试断言英文文案（Playwright 固定 `locale: "en-US"`）。
- 不在测试里依赖真实 SDK / 网络；不确定的行为用 `window.__pi` 控制（如 `nextReply`、`holdStreaming`）。
