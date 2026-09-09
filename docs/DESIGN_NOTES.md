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

## 2. 文件树：刷新是自带的，不要手动刷新按钮

VSCode 的文件树**没有**「刷新」按钮——它靠文件监听自动刷新。Pine 同样：

- 主进程用 `fs.watch(root, { recursive: true })` 监听工作目录，300ms 防抖后发 `files:changed` 事件。
- 渲染层收到后 dispatch `refreshTreeRequest`，重载已展开目录 + 干净的编辑器标签页。
- **已删除**：文件树头部的刷新按钮、右键菜单的「刷新」、会话面板的刷新按钮。
- 副作用：agent 改完文件、外部编辑器改动、git 切换分支，树都会自动更新，无需用户干预。

## 3. 编辑器：行号 + 快捷键是底线

- 行号栏与文本滚动同步（`white-space: pre` + `wrap="off"`，保证一一对应）。
- Tab 插入 2 空格；Ctrl/Cmd+S 保存。
- 状态栏显示「行/列、总行数、UTF-8」。

## 4. 会话：自动保存 + 续接 + 删除 + 新建

- 会话自动持久化到 `<安装目录>/sessions/`（开发时是 `apps/desktop/sessions`，打包后是 exe 同目录）。
- SDK 用 `SessionManager.create/open`（替代 inMemory），续接用 `SessionManager.open(path, dir, cwdOverride)`。
- 左侧 `SessionsPanel`：列表、续接、删除、**新建**（明确的「新建会话」按钮，点击后清空当前对话，下一条消息落到新会话文件）。
- 会话统计（消息数 / tokens / 花费）来自 `session.getSessionStats()`，在 `settled` 时通过 `session_stats` 事件推给渲染层。

## 5. 模型与对话模式（Cursor 风格：模型在聊天输入框下方）

- **模型切换**在聊天窗口**底部**（输入框下方 `ComposerBar`），模仿 Cursor。
- 只显示**已配置密钥**（`configured`）的 provider 的模型，其余不出现。
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

- 聊天工具栏 `ChatToolbar` 提供：模型切换、快速/深度模式、会话设置（齿轮）。
- 会话设置目前支持**重命名会话**（`SessionManager.appendSessionInfo`）；模型与思考层级已在工具栏。
- 后续扩会话设置：compaction 开关、temperature、retry 等，从 `SettingsManager` 方向扩展。

## 9. SDK 能力清单（截至当前版本用到的）

| 能力 | 来自 | 用途 |
| --- | --- | --- |
| `ModelRuntime` | pi-coding-agent | provider/model 目录、内存凭证 |
| `InMemoryCredentialStore` | pi-ai | 密钥只存内存 |
| `createAgentSession` | pi-coding-agent | 创建会话 |
| `AgentSession` | pi-coding-agent | prompt/abort/subscribe/setModel/setThinkingLevel/getSessionStats |
| `SessionManager` | pi-coding-agent | 会话持久化、列表、打开、删除、appendSessionInfo |
| `SettingsManager` | pi-coding-agent | 会话设置（compaction/retry） |
| `createExtensionRuntime` | pi-coding-agent | 零配置 ResourceLoader |
| `ResourceLoader` | pi-coding-agent | 不读默认配置 |

> 后续要加「每会话更多设置」时，从 `SessionManager.appendSessionInfo` / `SettingsManager` / `setThinkingLevel` 方向扩展。

## 10. 已知取舍 / 待办

- 会话列表目前展示全部目录的会话（不做按文件夹过滤），因为需求是统一存在一处。
- 文件监听在个别平台可能失败（权限/平台限制），失败时静默降级为「靠显式文件操作保持正确」。
- 存量组件里仍有一些历史 px 间距，正在逐步迁移到 `theme.spaces`；新代码必须遵守 spaces/colors 契约。
