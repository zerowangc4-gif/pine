# Pine 设计备忘录

> 这是一份设计原则与决策记录。改代码前先读这里，避免重新踩坑。

## 0. 总原则：这是给人干活的工具

Pine 不是演示项目，是**用来工作**的工具。每一个设计选择都必须回答两个问题：

1. **符合人性能吗？**（操作是否顺、是否少、是否不打断思路）
2. **有人用的理由吗？**（相比 VSCode / CLI，这个功能是否真的让人更省力）

没有这两个答案的功能不要加。宁可少而精，不要多而乱。

### 谁会用（用户画像）

- 主要用户是**在本地项目里干活的开发者**：打开文件夹 → 让助手读代码、改代码、跑命令、追问细节。
- 他们在意：**少打断**（文件树自动刷新、不弹窗）、**可掌控**（能换模型、能选快/深度模式）、**能回溯**（会话能存、能续、能删、能重命名）。
- 因此优先级：目录与编辑器的顺滑 > 会话管理 > 模型/模式切换 > 外观。

## 1. 核心约定：核心包的导出收敛到一处

原则（重要）：**从核心包导出的函数/类型，必须从一个文件导出（或按分类从一个地方导出），用的时候从这个文件 import。**

这样一眼就能看到「我们到底用了 SDK 的多少能力」。

- 文件：`apps/desktop/src/main/core/pi.ts`
- 规则：主进程不要直接 `import "@earendil-works/pi-coding-agent"`，而是 `import { … } from "../core/pi"`。
- 新增 SDK 能力时，先在 `core/pi.ts` 里补一行，再在业务代码里使用。

## 2. 文件树：极简 + 自动刷新，像 VSCode

- **没有头部标题栏**：资源管理器顶部不渲染「资源管理器 / 新建 / 折叠」那一行；新建文件/文件夹、折叠全部等操作都走**右键菜单**（目录节点右键、空白处右键 = 根目录菜单）。
- **刷新是自带的**：VSCode 的文件树没有「刷新」按钮，Pine 同样。
- 主进程用 `fs.watch(root, { recursive: true })` 监听工作目录，300ms 防抖后发 `files:changed` 事件。
- 渲染层收到后 dispatch `refreshTreeRequest`，重载已展开目录 + 干净的编辑器标签页。
- 窗口重新获得焦点时也补一次 `refreshTreeRequest`（像 VSCode 一样，兜底监听漏掉的变更）。
- **已删除**：文件树头部整行、刷新按钮、右键菜单的「刷新」、会话面板的刷新按钮。
- 副作用：agent 改完文件、外部编辑器改动、git 切换分支，树都会自动更新，无需用户干预。

## 3. 编辑器：行号 + 快捷键 + 改动 diff

- 行号栏与文本滚动同步（`white-space: pre` + `wrap="off"`，保证一一对应）。
- Tab 插入 2 空格；Ctrl/Cmd+S 保存。
- 状态栏显示「行/列、总行数、UTF-8」。
- **改动 diff**：文件被外部（agent/edit 工具）修改后，编辑栏头部出现「查看改动」按钮，点开显示上一版 vs 当前版的逐行 diff（新增绿/删除红），再点退出。用 `diff` 包的 `diffLines` 计算，`OpenFile.previousContent` 记录上一版。

## 4. 会话：自动保存 + 续接 + 删除 + 新建

- 会话自动持久化到 `<安装目录>/sessions/`（开发时是 `apps/desktop/sessions`，打包后是 exe 同目录）。
- SDK 用 `SessionManager.create/open`（替代 inMemory），续接用 `SessionManager.open(path, dir, cwdOverride)`。
- 左侧 `SessionsPanel`：列表、续接、删除、**新建**（明确的「新建会话」按钮，点击后清空当前对话，下一条消息落到新会话文件）。
- 会话统计（消息数 / 输入 tokens / 输出 tokens / 花费）来自 `session.getSessionStats()`，在 `settled` 时通过 `session_stats` 事件推给渲染层；无会话时显示 0，不再隐藏统计栏。
- **每轮花费**：`message_end` 时把该条 assistant 消息的 `usage` 作为 `message_usage` 事件推给渲染层，渲染在每条助手回复下方（输入/输出/花费）。
- **图片**：用户消息支持粘贴/选择图片（base64 传 `ImageContent`），仅对 `acceptsImages` 模型开放；持久化后重载也能还原图片。

## 5. 模型与对话模式（Cursor 风格：模型在聊天输入框下方）

- **模型切换**在聊天窗口**底部**（输入框下方 `ComposerBar`），模仿 Cursor。
- 只显示**已配置密钥**（`configured`）的 provider 的模型，其余不出现；同 provider 的模型在列表里**分组显示**（组头 = provider 名），一眼看清「这个 key 能用哪些模型」。
- **两种对话模式**：`快速（low）` / `深度（high）`，对应 SDK `setThinkingLevel`。默认深度。
- **换模型**：`session.setModel(model)`（若已有会话）会把 `model_change` 写进会话 transcript；无会话时只更新连接，下一条消息生效。
- **登录后已配置 key 的模型可选**：`ProviderInfo.configured` 标记；`connect()` 在 provider 已配置时允许不重复填 key。

## 6. 主题：两套 + spaces/colors 契约

- 图标全部手写 SVG，统一放在 `components/icons.tsx`，**不引外部图标库**；如果将来需要大量图标，再评估 lucide-react 之类（可参考 `E:/agents/pi` 的生态）。
- 只有两个主题：`dark`（默认）/ `light`，见 `theme/theme.ts` 的 `themes` / `getTheme()`。
- 颜色统一走 `theme.colors.*`，距离/内边距/间隙统一走 `theme.spaces["…"]`（Tailwind 风格 scale：`1`=4px、`4`=16px…）。**禁止硬编码颜色与 px 间距**。
- 切换：`ThemeSwitcher` → Redux `theme` slice → `ThemedRoot` 注入 `ThemeProvider`。**仅内存，不持久化**（不使用 localStorage）。
- 新 token 先改 `Theme` 接口（契约），再补两个主题各自的值。

## 7. 布局：侧栏可拉扯 + 聊天全屏

- 左侧栏宽度可左右拖动（`ResizeHandle`，Redux `layout` slice 记录 `sidebarWidth`，范围 200–640px）。
- 聊天/编辑器可全屏：Tab 栏右侧的全屏按钮隐藏侧栏（`sidebarVisible`），再点恢复。
- 与主题/语言一样，布局状态**仅存 Redux 内存**，不写 localStorage。

## 8. 会话设置（在会话内配置当前会话）

- 聊天工具栏 `ComposerBar` 提供：模型切换、快速/深度模式、会话设置（齿轮）。
- 会话设置支持：**重命名会话**（`SessionManager.appendSessionInfo`）与**自动压缩上下文**开关（`AgentSession.setAutoCompactionEnabled`，来自 `SettingsManager`）。
- 模型与思考层级仍在工具栏（更常用，不必进设置）。

## 8.5 资源加载（skills / extensions / context files）

- 会话创建时从**项目目录**加载 skills：`<root>/.pi/skills` 与 `<root>/.agents/skills`（`loadSkillsFromDir`），随 system prompt 注入。
- **extensions**：会话创建前用 `discoverAndLoadExtensions([...], root, root, eventBus)` 加载项目 `.pi/extensions` 与 `.agents/extensions`，`getExtensions()` 返回加载结果；自定义工具/命令随会话生效。
- **context files**：`getAgentsFiles()` 用 `loadProjectContextFiles({ cwd, agentDir })` 读项目 `AGENTS.md` / `SYSTEM.md` 等。
- 仍不加载 `~/.pi/agent` 全局默认配置（`agentDir` 指向项目目录）。
- MCP：当前 SDK（v0.85.1）**没有** MCP 客户端/服务器支持；SDK 官方接入点是 `createAgentSession({ customTools })`（MCP tool → ToolDefinition）。用户已定：**重活不做，仅记录**。

## 9. SDK 能力清单（截至当前版本用到的）

| 能力 | 来自 | 用途 |
| --- | --- | --- |
| `ModelRuntime` | pi-coding-agent | provider/model 目录、内存凭证 |
| `InMemoryCredentialStore` | pi-ai | 密钥只存内存 |
| `createAgentSession` | pi-coding-agent | 创建会话 |
| `AgentSession` | pi-coding-agent | prompt/abort/subscribe/setModel/setThinkingLevel/getSessionStats/setAutoCompactionEnabled |
| `SessionManager` | pi-coding-agent | 会话持久化、列表、打开、删除、appendSessionInfo |
| `SettingsManager` | pi-coding-agent | 会话设置（compaction/retry） |
| `loadSkillsFromDir` | pi-coding-agent | 项目级 skills 发现 |
| `discoverAndLoadExtensions` | pi-coding-agent | 项目级 extensions（自定义工具/命令） |
| `loadProjectContextFiles` | pi-coding-agent | 项目 `AGENTS.md` / `SYSTEM.md` 注入 |
| `createEventBus` | pi-coding-agent | 扩展加载时的事件总线 |
| `createExtensionRuntime` | pi-coding-agent | 零配置 ResourceLoader |
| `ResourceLoader` | pi-coding-agent | 不读默认配置 |

> 后续要加「每会话更多设置」时，从 `SessionManager.appendSessionInfo` / `SettingsManager` / `setThinkingLevel` 方向扩展。

## 10. 已知取舍 / 待办

- 会话按**当前工作目录**过滤（`SessionManager.list(root, sessionsDir)`），不再跨文件夹展示；存储仍统一在 `<安装目录>/sessions/`。
- 文件监听在个别平台可能失败（权限/平台限制），失败时静默降级为「靠显式文件操作保持正确」。
- 间距已全部迁移到 `theme.spaces`（无裸 px 间距），新代码继续遵守 spaces/colors 契约。
- MCP：SDK 无原生 MCP，待后续评估是否用独立子进程接 MCP client（可参考 Claude Code 的 `.mcp.json` 约定）。

## 11. AI 助手工作备忘（跨会话续作）

> 这是给后续接手（人或 AI）的「我当时的想法」记录，允许随时改写/删除。

- **谁会用它**：本地开发者在自己的项目文件夹里让助手读代码/改代码/跑命令。所以「少打断 + 可掌控 + 能回溯」是第一原则；花哨的全局功能（云同步、多工作区、插件市场）优先级很低。

- **战略方向（用户明确）**：Pine 是用户「以当前功能为核心，去做其他产品」的**底座**。所以两条命根子：**自己可扩展的能力（extensions）** 与 **skills**；并先把现有能力做稳。已写入 AGENTS.md 宪法第 7 条。
- **已落地（本轮）**：extensions（项目 `.pi/extensions` / `.agents/extensions`，`discoverAndLoadExtensions`）+ context files（`loadProjectContextFiles`，读项目 `AGENTS.md`/`SYSTEM.md`）。skills 之前已落地。
- **结构重构（已做）**：`pine-service.ts` 拆分——纯函数/资源加载移到 `services/resources.ts`、消息提取移到 `services/messages.ts`、基础提示词移到 `core/prompt.ts`；`core/pi.ts` 仍是唯一 SDK 出口。新增 `ipc/skills.ts`（技能列表/新建）。
- **技能管理 UI（已做）**：ComposerBar 齿轮旁加「技能」按钮（星形图标）→ `SkillsModal`：列出当前项目已加载 skills、可新建 skill（生成 `.pi/skills/<name>/SKILL.md` 模板）。
- **工具权限（已做，方案 A）**：ComposerBar 盾牌按钮 → `PermissionsModal`：`read` 始终开启，`bash`/`edit`/`write` 可开关。主进程 `PineService.activeTools` 存权限，创建会话时 `createAgentSession({ tools })`，运行时 `setActiveToolsByName()` 生效。**用户已定：不做逐次审批（write 弹窗确认）**，如需后续按 extension `tool_call` block 钩子 + 跨进程弹窗设计。
- **代码审查修复（已修）**：① 新建/重命名路径穿越（`createEntry`/`renameEntry` 的目标路径补 `resolveWithinRoot`）；② 后台刷新不再抢切活动标签页（新增 `refreshFileSuccess`，不改 `activePath`）；③ 会话列表按当前目录过滤；④ 重连不再重置思考层级；⑤ 硬编码颜色/文案改走 theme/i18n。

- 用户目标是做「Pi 的 GUI」：把 `@earendil-works/pi-coding-agent` 的能力装进 Electron 桌面端。优先级由用户反复强调：**干净代码（宪法）> 少打断（无刷新按钮、右键操作）> 花费/图片/会话 > skill/MCP**。
- 用户不想要「资源管理器」头部那一行按钮，所有文件操作走右键；这点和 VSCode 一致，别再加回顶部按钮。
- 花费要“每次都显示”：已做 per-message `message_usage` + 底部总计；若以后要做“按 provider/model 聚合花费”，可以从 `getUsageCostBreakdown(entries)`（usage-totals.js）扩展。
- 图片只对 `model.input.includes("image")` 的模型开放；发送前在 `acceptsImages` 已拦一道，但极端情况（模型切换后仍带旧图）需主进程/provider 自行报错。
- skills 目前只扫项目目录，未做信任弹窗；以后若加全局 `~/.pi/agent/skills` 需要同步做“是否信任”提示（SDK 有 `resolveProjectTrust`）。
- MCP 是明确缺口：SDK 源码 `packages/coding-agent/README.md` 明确写 “**No MCP.** Build CLI tools with READMEs (see Skills), or build an extension that adds MCP support.”（用户以为 pi 支持 MCP，实际不支持，已核源码）。SDK 的官方接入点是 `createAgentSession({ customTools })`——每个 MCP tool 转成一个 `ToolDefinition`，`execute()` 里发 JSON-RPC `tools/call`；需自己写 MCP client（stdio/SSE/HTTP 三种 transport + `initialize`/`tools/list`/`tools/call`）并读 `.mcp.json`。**用户已定：重活不做，先记录**。
- **重活不做（已定，仅记录）**：① Pi packages（npm/git 包资源，SDK `package-manager`）；② MCP bridge（见上一条）。后续若重启，按上面思路独立模块接 `customTools`。
- **下一步候选（重活不做，只做快赢/中批）**：
  1. 【快赢】prompt templates（`.pi/prompts`）——`loadPromptTemplates` 未从主入口导出，可用 `DefaultResourceLoader` 或自行读 `.pi/prompts/*.md`
  2. 【快赢】find/grep/ls 工具（`createFindTool/createGrepTool/createLsTool` 作 `customTools`）
  3. 【快赢】steer/followUp（streaming 中继续输入而不是只能 abort）
  4. 【中批】会话分支/fork、手动压缩、会话树、HTML 导出
  5. 【小项】模型循环、每模型思考层级、cache-miss/压缩花费提示
  - 已做（勿重复）：skills、extensions、context files、图片、花费、自动压缩开关、会话设置。
