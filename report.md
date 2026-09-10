# Pine 项目审查报告

> 审查日期：2025-09-10　|　对象：`E:\agents\pine`（Electron 桌面编码代理，封装 `@earendil-works/pi-coding-agent`）
> 验证基线：`pnpm typecheck` ✅　`pnpm lint` ✅（均无错误）
>
> **⚠️ 状态更新（后续提交已修复大部分缺陷）**：以下「已确认的 bug」中，
> #1（缺 `common.close`）、#2（连接切换会话残留）、#3（session 目录未 ignore）、
> #4（agent 改动静默覆盖）、#5（`chatSend` pending 整个 run）、#6（Windows 路径大小写）、
> #7（同名工具结束错配）均已修复；断连/登出入口也已落地。
> 剩余待办只有留存类：重启后恢复最近工作区/继续上次会话、diff 审查闭环（accept/reject）升级为工作流核心。
> 具体现状以代码与 `docs/DEVELOPMENT.html` 为准，本报告仅保留历史记录价值。

---

## 0. 一句话结论

代码工程质量高（分层规范、类型严格、双语齐全），产品方向也有真实需求；但当前有几个会直接影响信任和留存的缺陷——**连接切换后的会话残留、agent 改动文件的静默覆盖、重启后一切归零**。赛道建议：不做 Cursor 平替，做"**能看见钱的、改动可审查的、本地优先**"的编码代理。

---

## 1. 它是什么

Electron 桌面端编码助手：

- 登录页：选 provider / model / 输 API key → 连接校验
- 聊天页：打开文件夹 → 与 agent 对话，agent 通过 `read / bash / edit / write` 在该文件夹内工作
- 附带：文件树 + 简易编辑器（diff 视图）、会话管理（JSONL 持久化）、skills 管理、权限开关、实时 token/成本统计

技术栈：Electron 37 + electron-vite、React 19 + TS、Redux Toolkit + redux-saga、styled-components、i18next（zh-CN / en-US）。SDK（`@earendil-works/pi-coding-agent` 0.85.1）只在主进程使用，走 `shared/types.ts` + `shared/ipc.ts` + preload 桥。

---

## 2. 已确认的问题

### 2.1 明确的 bug

| # | 问题 | 位置 | 影响 |
| --- | --- | --- | --- |
| 1 | **缺 i18n key `common.close`**：`t("common.close")` 在两个语言包中均不存在 | `renderer/features/chat/components/PermissionsModal.tsx:31` | 权限弹窗"关闭"按钮渲染成原始 key 文本 |
| 2 | **连接新 provider 后旧会话"幽灵残留"**：主进程 `connect()` 成功即 `disposeSession()`，但渲染层 `connectWithKeySuccess` 不清空 `messages` / `activeSessionPath` | `main/services/pine-service.ts:150` + `renderer/features/login/store/saga.ts:68` | 切换连接后界面仍挂着旧对话；继续发消息会在**新空 session** 上追加而列表前段属于已销毁 session；期间改名/settings 会报 `noActiveSession`；重载后历史不一致 |
| 3 | **session 文件未加入 .gitignore**：`apps/desktop/sessions/` 已有两个遗留 `.jsonl`（早期相对路径写入产物） | 仓库根 | 易被误提交；建议清理并 ignore |

### 2.2 数据 / 并发风险

| # | 问题 | 位置 | 风险 |
| --- | --- | --- | --- |
| 4 | **agent 改动被静默覆盖**：对"干净"的已打开文件自动重读磁盘并写回 buffer，`savedContent` 同步成磁盘值，无"agent 改了此文件 → accept/reject"闭环 | `renderer/features/workspace/store/saga.ts:149-155` + slice `refreshFileSuccess` | 用户与 agent 同时编辑同一文件时互相覆盖；agent 的修改被无提示接受。**信任问题** |
| 5 | **`chatSend` IPC handler pending 整个 agent run**：`await session.prompt(...)` 可能几分钟；渲染层 `takeLatest` 取消任务并不能取消主进程已跑的 handler | `main/ipc/chat.ts` + `chat/store/saga.ts` | 快速连发/切会话/重连时并发进入 `prompt`，`isStreaming` 判定窗口竞态 → "already streaming" 幽灵错误或双流 |
| 6 | **Windows 路径大小写敏感**：`isPathUnder/remapPath` 与 `resolveWithinRoot` 均为大小写敏感字符串比较 | `renderer/utils/path.ts`、`main/ipc/files.ts` | 大小写不一致路径导致节点清不干净或误判越出 root（应 `path.relative` 后按平台不区分大小写） |
| 7 | **同名工具结束状态错配**：`toolEnded` 按"名字 + 最后一个 running"回填，同名/并发调用乱序时标错 | `chat/store/slice.ts` | 建议 tool 事件携带稳定 id（主进程 `forwardEvent` 生成） |

### 2.3 生命周期 / 留存问题（比 bug 更伤）

- **无登出/断开入口**；API key 只在内存 → 每次启动重输 key、重选文件夹。
- 会话 JSONL 已持久化在 userData，但**没有"最近工作区 / 继续上次"入口** → 重启 = 回到空白登录页。对桌面工具是最大流失点。
- 创建 skill 会写 `.pi/skills/SKILL.md`、`.pi/skills/README.md` **进用户仓库**且无 .gitignore 提示，易被无意 commit。
- 宣传口径注意：系统"零默认配置"指不读 `~/.pi/agent` 机器级配置；agent 仍会读取**被打开项目**的 AGENTS.md / `.pi` extensions / skills。

---

## 3. 别人为什么会用（真实卖点）

1. **BYOK、多模型、不锁供应商**：一套 key 可在同一会话随意切换 OpenAI/Anthropic 等模型，无订阅绑架。
2. **钱看得见**：每轮消息 + 整场会话实时 token/成本（底部 chip + 每条消息 usage），这是 Cursor 类产品给不了的透明度。
3. **本地 + 可审计**：会话为 userData 下 JSONL，可续、可回放、可导出；无云端账号；agent 作用域严格限定在打开的文件夹，工具可显式开关。
4. **skills 进仓库**：`.pi/skills/SKILL.md` 随项目版本化，团队可共享、可 review，回应"提示词魔法不可审计"。
5. **双语（zh-CN/en-US）+ 中文文档引导**：面向中文开发者是实打实的差异化。

目标人群：BYOK 重度用户、成本敏感者、隐私敏感 / 代码不出本机者、小团队与独立开发者、企业合规试点（本地 + 可审计）。

---

## 4. 该走哪个赛道

**最佳定位**：面向**中文开发者 + 隐私/成本敏感用户**的"自备 Key、多模型、本地会话、账单透明"桌面编码代理。

- 对标：Cursor / Continue / Roo Code（而不是再做"AI 聊天套壳"）
- 不要做：又一个 IDE 全家桶；不与 Cursor / Trae / 国内大厂拼终端生态、托管模型、云同步

把下注点放在 Cursor 们为卖订阅**故意不做**的地方：

1. **审查闭环做成招牌**：agent 每个改动 → 文件级 diff + 单条 accept/reject，拒绝可继续对话修正（把只读 DiffView 升级为工作流核心）。
2. **成本第一公民**：发送前预算提示、每消息成本、穷/富模型切换建议、周账单导出。
3. **会话即产物**：JSONL 本地回放 / 导出 / 团队共享，服务"代码不出机、过程可审计"。
4. **项目级能力资产化**：skills / AGENTS 进仓库，多人协作复用。
5. **中文社区与文档**是天然根据地。

一句话：**别做 Cursor 的国产平替，做"能看见钱的、改动可审查的、本地优先的编码代理"**。

---

## 5. 优先修复路线（下注顺序）

| 优先级 | 事项 | 类型 |
| --- | --- | --- |
| P0 | 重启续接：最近工作区 + 历史会话一键进入（key 用 Electron `safeStorage` 可选持久化） | 留存 |
| P0 | diff 审查闭环：agent 改动显式提示 + 逐条 accept/reject | 信任 |
| P1 | 修连接切换会话残留（bug #2）+ 清理断连/登出入口 | 正确性 |
| P1 | `chatSend` 改为 fire-and-forget，状态全部走事件流（bug #5） | 并发 |
| P1 | 补 `common.close`（bug #1）；session 目录清理 + gitignore（bug #3） | 收尾 |
| P2 | 工具事件带稳定 id；Windows 路径大小写归一；`.pi/skills` 写库前确认 | 打磨 |
