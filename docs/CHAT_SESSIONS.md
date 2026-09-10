# 聊天会话能力清单（代办 README）

> 本文档是聊天会话（Chat Session）相关能力的唯一代办清单：左边是能力地图，右边是当前实现状态。
> 改动会话能力时，请同步更新本文件与 `docs/DEVELOPMENT.html`。
>
> 数据流约定（见 `AGENTS.md`）：能力按五步接入 —— `shared/types.ts` 类型 → `shared/ipc.ts` channel → `preload/index.ts` 桥 → `main/ipc/<域>.ts` handler → 渲染层 saga + 双语 i18n。

## 状态图例

- ✅ 已实现
- ⬜ 未实现（待办）

---

## 1. 会话生命周期（Session lifecycle）

| # | 能力 | 状态 | 入口 / 说明 |
| --- | --- | --- | --- |
| 1.1 | 新建会话 | ✅ | `SessionsPanel` 的「新建会话」；`newSession()` → 中止并销毁当前会话 |
| 1.2 | 列出会话 | ✅ | `listSessions()`；`SessionManager.list`，返回 `{sessions, activePath}` |
| 1.3 | 加载 / 切换会话 | ✅ | `loadSession(path)`；打开 `.jsonl` 并还原消息列表、统计、设置 |
| 1.4 | 删除会话（含二次确认） | ✅ | `deleteSession(path)`；删除活动会话时先 `disposeSession()` |
| 1.5 | 重命名会话 | ✅ | 会话设置弹窗中的「会话名称」；`renameSession(name)` |
| 1.6 | 断开连接 / 登出 | ✅ | 顶栏「断开连接」按钮；`disconnect()` 销毁会话并清空内存连接 |
| 1.7 | 恢复最近工作区 / 继续上次会话 | ⬜ | 重启后回到登录页，缺少「最近工作区 + 历史会话一键进入」入口 |

## 2. 消息收发（Messaging）

| # | 能力 | 状态 | 入口 / 说明 |
| --- | --- | --- | --- |
| 2.1 | 发送文本消息 | ✅ | 输入框 Enter 发送 / Shift+Enter 换行；`sendMessage` |
| 2.2 | 图片附件 / 粘贴 / 拖拽 | ✅ | 仅视觉模型开放；`attachImage` / `pasteImage` / `dropImages` |
| 2.3 | 流式回复 | ✅ | `agent_start → assistant_start → text_delta → assistant_end → settled` |
| 2.4 | 思考过程展示 | ✅ | `thinking_delta`；「思考中」可折叠展开 |
| 2.5 | 工具调用状态 | ✅ | `tool_start / tool_end`；running / done / error 三种状态 chip |
| 2.6 | 中止生成 | ✅ | 流式期间的「停止」按钮；`abort()` |
| 2.7 | 追问（Follow up） | ✅ | 流式期间等待当前回复后继续；`session.followUp` |
| 2.8 | 打断（Steer） | ✅ | 流式期间立即处理新输入；`session.steer` |
| 2.9 | Markdown 渲染 | ✅ | `react-markdown` + `remark-gfm`（代码块 / 表格 / 引用等） |
| 2.10 | 复制消息 | ✅ | 每条用户 / 助手消息旁的复制按钮；`copyText()` |
| 2.11 | 消息编辑 / 重发 | ⬜ | 尚未实现（不在此次范围） |

## 3. 会话内配置（In-session configuration）

| # | 能力 | 状态 | 入口 / 说明 |
| --- | --- | --- | --- |
| 3.1 | 切换模型 | ✅ | 底部栏模型下拉；`switchModel(provider, model)` |
| 3.2 | 快速 / 深度思考模式 | ✅ | 底部栏 `modeFast` / `modeDeep`；`setThinkingLevel` |
| 3.3 | 连接新服务商 | ✅ | `ConnectProviderModal`；会话内补 API key |
| 3.4 | 工具权限开关 | ✅ | `PermissionsModal`；read / bash / powershell / edit / write / grep / find / ls 均可开关 |
| 3.5 | 禁用工具运行时申请权限 | ✅ | 禁用工具后，助手每次尝试使用该工具时弹 `ToolPermissionModal`（允许 / 拒绝），不再直接「不可用」 |
| 3.6 | 自动压缩上下文 | ✅ | 会话设置弹窗开关；`setAutoCompaction` |

## 4. 统计与计费（Stats & cost）

| # | 能力 | 状态 | 入口 / 说明 |
| --- | --- | --- | --- |
| 4.1 | 会话级统计 | ✅ | `session_stats` 事件；消息数 / tokens / 成本 |
| 4.2 | 单条消息 usage | ✅ | `message_usage` 事件；每条助手消息显示 ↑ / ↓ / 花费 |

## 5. 导出与持久化（Export & persistence）

| # | 能力 | 状态 | 入口 / 说明 |
| --- | --- | --- | --- |
| 5.1 | 会话自动持久化 | ✅ | `SessionManager` 写入 userData 下的 `.jsonl` |
| 5.2 | 导出当前会话 | ✅ | 底部栏「导出会话」；`dialog.showSaveDialog` + 复制 `.jsonl` |
| 5.3 | 会话回放 / 导入 | ⬜ | 尚未实现（不在此次范围） |

---

## 本次补齐的内容

1. **复制消息**（2.10）
   - `ChatView.tsx` 新增 `CopyMessageButton`，用户消息与助手消息均可复制，复用已有 `window.pi.copyText` 与 `CopyIcon`。
   - i18n：`chat.copyMessage`（zh-CN / en-US）。

2. **断开连接 / 登出**（1.6）
   - 五步接入：`Pi.disconnect()` → `model:disconnect` channel → preload → `registerProviderIpc` handler → `loginSaga`。
   - `PineService.disconnect()`：销毁活动会话并清空内存连接；磁盘上的会话文件保留。
   - 渲染层 `disconnectSuccess` 同时重置 login 与 chat 状态，路由守卫自动回到登录页。
   - i18n：`layout.disconnect`（zh-CN / en-US）；新增 `LogoutIcon`。

3. **导出当前会话**（5.2）
   - 五步接入：`Pi.exportSession(title)` → `sessions:export` channel → preload → `registerSessionsIpc` handler → `chatSaga`。
   - 主进程使用 `dialog.showSaveDialog` 选择目标并复制活动 `.jsonl`；标题由渲染层传入（不硬编码主进程文案）。
   - `PineService.getActiveSessionPath()` 暴露活动会话文件路径。
   - i18n：`chat.exportSession`（zh-CN / en-US）；新增 `DownloadIcon`。

## 仍未实现（待办，按优先级）

- **P0 恢复最近工作区 / 继续上次会话**（1.7）：重启后自动恢复上次打开的文件夹与历史会话，是桌面工具最大的留存点。
- **P1 会话回放 / 导入**（5.3）：读取 `.jsonl` 回放或导入外部会话。
- **P2 消息编辑 / 重发**（2.11）：编辑上一条消息后重新生成。

---

## 验证

```bash
# 从仓库根目录
pnpm --filter @pine/desktop typecheck
npx eslint apps/desktop/src
cd apps/desktop && npx electron-vite build

# e2e（渲染层 + 模拟 window.pi，无需真实 API key）
pnpm --filter @pine/desktop e2e
```
