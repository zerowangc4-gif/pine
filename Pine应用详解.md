# Pine 应用详解 —— 自顶向下弄懂整个项目

> 面向对象：想**真正理解** Pine 这个项目（而不只是会跑起来）的开发者。
> 本文件先从整体架构讲清楚系统分成哪几层、数据怎么流，然后**用极大篇幅**逐文件拆解上层的
> 桌面应用（UI 前端）与 sidecar 胶水层，最后给一个「发一条消息」的端到端数据流串讲。
>
> `packages/agent` 与 `packages/ai` 是上游核心（注释与文档声明**禁止修改**），本文只讲它们
> 的角色与暴露给 runtime 的接口，不深入其内部源码。

## 目录

1. [这是什么 / 一句话架构](#1-这是什么--一句话架构)
2. [仓库与包结构总览](#2-仓库与包结构总览)
3. [技术栈与运行方式](#3-技术栈与运行方式)
4. [核心心智模型](#4-核心心智模型)
5. [上层详解 A —— 传输层 protocol](#5-上层详解-a--传输层)
6. [上层详解 B —— 运行时 sidecar（runtime）](#6-上层详解-b--运行时-sidecar)
7. [上层详解 C —— 桌面 UI（desktop 前端）](#7-上层详解-c--桌面-ui)
8. [上层详解 D —— Tauri 外壳与 sidecar 打包](#8-上层详解-d--tauri-外壳)
9. [一条消息的完整旅程（数据流串讲）](#9-一条消息的完整旅程)
10. [常见开发任务地图](#10-常见开发任务地图)

---

## 1. 这是什么 / 一句话架构

Pine 是一个**本地运行的编码智能体（coding agent）桌面应用**。给它一个工作目录，它就能用
`read / write / edit / bash` 等工具去读写文件、运行命令，帮你改代码、查项目、跑测试。

整个系统是「**一个薄浏览器 UI + 一个环回地址上的 Node 进程**」两段式：

```
┌─────────────────────────────────────────────────────────────────┐
│  桌面应用 apps/desktop（Tauri WebView 里跑的 React 前端）          │
│  ─ 纯展示 + 用户意图，不含任何 agent 逻辑                          │
│      │  Socket.IO (http://127.0.0.1:7821, 仅 loopback)           │
│      ▼                                                           │
│  运行时 sidecar packages/runtime（Node 进程，Socket.IO 服务端）     │
│  ─ 把协议请求翻译成对上游 Agent 的调用、把 Agent 事件广播回 UI       │
│      │                                                           │
│      ▼                                                           │
│  上游核心 packages/agent + packages/ai（禁止修改）                  │
│  ─ 真正的 agent loop、tool 执行、provider/模型调用                  │
└─────────────────────────────────────────────────────────────────┘
```

关键点：

- **UI 与 agent 完全解耦**。UI（React + Redux）只通过一条**类型化 Socket.IO** 通道与 sidecar 通信，
  跨网络的数据形状都定义在 `@pine/protocol`；浏览器**绝不会把 provider 实现编译进去**。
- **sidecar 是唯一允许触碰 `@pine/agent`/`@pine/ai` 的地方**。想扩展 Pine，几乎都改
  `protocol`、`runtime`、`desktop` 三层。
- 打包后，**Node 运行时和单文件 bundle 的 sidecar 脚本被内嵌进安装包**，由 Tauri 基座拉起；
  开发时则 `pnpm dev:runtime` 单独跑。

---

## 2. 仓库与包结构总览

pnpm workspace monorepo。包分两类：

| 路径 | 包名 | 角色 | 归属 |
| --- | --- | --- | --- |
| `apps/desktop` | `@pine/desktop` | Tauri 前端 + React UI + Rust 外壳 | ✅ 上层 |
| `packages/runtime` | `@pine/runtime` | sidecar：Socket.IO 服务端、驱动 Agent 的会话 | ✅ 上层 |
| `packages/protocol` | `@pine/protocol` | 跨网络类型契约（零依赖） | ✅ 上层 |
| `packages/telemetry` | `@pine/telemetry` | 遥测抽象（本文一笔带过） | — |
| `packages/agent` | `@pine/agent` | 上游核心：agent loop/会话/JSONL/compaction | ❌ 禁止 |
| `packages/ai` | `@pine/ai` | 上游核心：模型目录/provider/auth/oauth | ❌ 禁止 |

根目录相关：
- `scripts/prepare-sidecar.mjs`、`bundle-runtime.mjs`、`check-sidecar.mjs` —— 打包/回归 sidecar。
- `中文说明文档.md` —— 使用向中文说明（怎么跑、UI 怎么操作、Ollama/DeepSeek 如何配）。
- `docs/` 英文：CAPABILITIES / CONFIG / DEVELOPMENT。
- `.env.example`：`DEEPSEEK_API_KEY` 等环境变量。

**顶层脚本词表**（识别与常用）：`dev:runtime`、`dev:ui`、`dev`、`dev:tauri`；`build` / `build:tauri`；
`typecheck`、`lint`、`smoke`（runtime 冒烟）、`check:sidecar`（把打包的 sidecar 跑一条完整会话回归）、
`playwright:install`。

依赖方向非常干净：`desktop → (protocol 仅类型, socket.io-client)`
`runtime → (agent/ai/protocol)`；`protocol` 自身**零依赖**，是「两层都能 import 的公共词典」。

---

## 3. 技术栈与运行方式

### 技术栈

**前端（apps/desktop/src）**
- React + Redux Toolkit + react-redux（`useAppDispatch/useAppSelector` hooks）
- styled-components（样式）+ 手写 Design tokens，不引入组件库
- socket.io-client（连 sidecar）
- 自研微型 **类型安全 i18n**（两个字典，缺 key = 编译错误）
- Tauri v2（`src-tauri` Rust）作 WebView 宿主

**sidecar（packages/runtime）**
- Node（>=22.19）跑 TS；开发用 `tsx`，构建后 bundle 成单个 `pine-runtime.cjs`
- socket.io（服务端），只监听 `127.0.0.1`

**上游（agent/ai）** —— 不作改动的库，仅被 runtime 消费。

### 运行（开发）

```bash
pnpm install
pnpm prepare:sidecar   # 产出 src-tauri/resources/runtime/pine-runtime.cjs 等
pnpm dev:runtime       # 终端1：sidecar（PINE_RUNTIME_PORT，默认 7821）
pnpm dev:ui            # 终端2：vite dev（http://127.0.0.1:5173）
```

浏览器开 UI 即可满足日常。要验真实 WebView/打包用 `pnpm build:tauri`（需 Rust + VS Build Tools）。

> **端口语义**：`RUNTIME_PORT=7821` 定义在 `@pine/protocol`。sidecar 端口被占会**静默退出**
> （当作「另一个 Pine runtime 已在跑」），于是多窗口可共享同一个 runtime。

### 环境变量 / localStorage 键速查

| 键 | 归属 | 作用 |
| --- | --- | --- |
| `PINE_RUNTIME_PORT` | sidecar/UI | 端口（默认 7821） |
| `PINE_SESSIONS_ROOT` | runtime | 会话 JSONL 根（默认 `~/.pine/sessions`） |
| `ANTHROPIC/GEMINI/OPENAI_PINE_API_KEY` 等 | runtime/model | 显式 key 缺省时回落的环境密钥 |
| `localStorage["pine.config.v3"]` | UI | 配置草稿持久化 |
| `localStorage["pine.ui.v1"]` | UI | 主题/语言/布局偏好 |

---

## 4. 核心心智模型

记住三个引擎幻觉很难解开的事实，读代码会顺畅很多。

### 4.1 三种「会话」别混淆
1. **Sidecar 里的活会话（AgentSession）**：真正在跑 Agent 的东西。
2. **浏览器的显示会话（session slice）**：UI 记录「当前看哪个 sessionId + 断言快照」。
3. **磁盘历史会话（JSONL transcript）**：可 resume 的存档。

三者靠 **sessionId（uuidv7）** 关联。活会话**比任何一条网络连接活得都久**：UI 刷新、断网、窗口重开
都**不该杀死正在流的 run**。客户端回来用 `session:open + resumeSessionId/重挂`「再次附身」继续播。

### 4.2 两个状态源并存（快照 = 真值，事件 = 增量）
- **快照 `AgentStateSnapshot`**（`session:state` / 各类 ack）：会话语义**真值**。用法统计、队列、资源、
  待批事项、配置、消息全量都以它为准。
- **事件 `AgentEvent`**（`agent:event`）：增量流。`message_update` 让正在长肉的助手消息实时刷新。

对应到 UI：**渲染用事件 → `transcript` slice；语义真值用快照 → `session` slice**，两个 slice 分开喂。

### 4.3 一条 socket.io room 总线
每个会话一条 room `session:<id>`，该会话的所有广播都进这个 room：
- 同一会话开 N 个窗口，各 socket 都 join 这个 room → 天然同步。
- 没 join 的 socket 收不到任何东西。
- `connectionStateRecovery`（2 分钟）负责掉线后的房间/漏帧恢复。
- 广播用 类型化 `ServerEmit` 发出，room 细节对上层透明。

请求/应答则用 **Socket.IO ack 回调**关联，代码里没有手写 message id。

---

## 5. 上层详解 A —— 传输层 protocol

位于 `packages/protocol/src/`，**零依赖**，只描述跨 socket.io 的 JSON。注释强调：这些是
`@pine/agent` 类型的**结构拷贝而非 re-export**。这样浏览器打包 desktop 时不会把 provider 实现
编进类型程序。runtime 的 `conformance.ts` 在编译期断言两者形状一致——上游一旦变形，
`pnpm --filter @pine/runtime typecheck` 即失败。

文件分工（`index.ts` 汇出）：

| 文件 | 内容 |
| --- | --- |
| `messages.ts` | 消息模型：content blocks、消息 role、usage |
| `events.ts` | `AgentEvent`：agent 生命周期事件联合 |
| `config.ts` | 用户可配置一切 + 默认值 + `mergeConfig` |
| `state.ts` | 快照、资源、审批、工作区、usage 总计 |
| `wire.ts` | 类型化 socket.io 事件对 + ack/Result 帮手 |

### 5.1 消息模型（messages.ts）

**Content blocks（消息体块）**
- `TextContent`（`type:"text"`）
- `ThinkingContent`（推理文本，可 `redacted`）
- `ImageContent`（base64 `data` + `mimeType`，**不带头** `data:` 前缀）
- `ToolCallContent`（一次工具调用）

**Usage**：`input/output/cacheRead/cacheWrite/reasoning?/totalTokens` + `cost{input,output,
cacheRead,cacheWrite,total}`。

**消息 role（`AgentMessage` 联合）**

| role | 谁产生 | UI 触发展示 |
| --- | --- | --- |
| `user` | 人 | 普通气泡 |
| `assistant` | 模型 | 含 thinking/text/toolCall 块 |
| `toolResult` | 某工具结果 | 折叠的工具结果 |
| `bashExecution` | shell（在模型之外另录 command/output/exitCode/truncated/fullOutputPath） | 命令块 |
| `custom` | 应用自定义（display 控制渲染） | 按 display |
| `compactionSummary` | 压缩摘要 | 摘要条 |
| `branchSummary` | 历史恢复的分支摘要 | 折叠条 |

助手纯函数（两边共用）：`messageText(m)`（纯文本投影：预览/标题）、`toolCallsOf(m)`（提取工具调用）、
`isDisplayable(m)`。

### 5.2 事件流（events.ts）

`AgentEvent` 十种，`AGENT_EVENT_TYPES` 给出健康 run 首个规范顺序：

```
agent_start
  └─ (每次"往返"= 一轮 turn)
  turn_start
    └─ (每条消息 start/update/end)
    message_start → message_update×N → message_end
    tool_execution_start → tool_execution_update → tool_execution_end
  turn_end
agent_end（附 messages 全量）
```

注意：`message_update` 所载的 `assistantMessageEvent` 是 **provider 层原样增量**，UI 不解析它，只用
事件里的 `message`（服务端拼好的整条）渲染，即「照抄整条 + 重绘」。

### 5.3 配置（config.ts）

配置是一个扁平大对象 `AgentConfig`。每个字段在注释里都标注了它映射的 Agent 能力：
构造参数 / 可变的 `Agent.state` 字段 / 某个运行时 hook 的输入。

**枚举/结构要点**
- `ThinkingLevel`：`off|minimal|low|medium|high|xhigh|max`（7 档，**注意首字母小写**）。
- `QueueMode`：`all | one-at-a-time`（排队消息的注入方式）。
- `ToolExecutionMode`：`sequential | parallel`。
- `Transport`：`auto|sse|websocket|websocket-cached`。
- `SupportedApi`，本 checkout 支持的 4 个 provider API：
  `openai-completions | openai-responses | anthropic-messages | google-generative-ai`
  （因生成式模型目录 `@pine/ai/providers/data` 不在此仓库，运行时就只开放不依赖目录的实现。）
- `ToolName`：`read|write|edit|bash|finish`；`READ_ONLY_TOOL_NAMES = [read, finish]`。
- `ModelSpec`：运行时物化"一个模型 + 一个 provider"所需的全部素（api/providerId/modelId/baseUrl/
  reasoning/supportsImages/contextWindow/maxTokens/cost/displayName/thinkingLevelMap）。
- `ApprovalPolicy`：`auto | ask-writes | ask | readonly`。
- `CompactionConfig`：enabled / reserveTokens / keepRecentTokens / customInstructions。
- `RetryConfig`：enabled / maxRetries / baseDelayMs。

**函数与默认**
- `DEFAULT_MODEL_SPEC`：默认 `openai-completions @ deepseek-chat : https://api.deepseek.com/v1`。
- `DEFAULT_SYSTEM_PROMPT`。
- `createDefaultConfig(cwd)`：默认 `approvalPolicy:"ask-writes"`、`autoApprovedTools:["read"]`、
  tools 初始 `finish:false`、其余 true、`persistSession:true`。
- **`mergeConfig(config, patch)`**：UI 与 runtime **共用**，保证「UI 乐观更新」与「服务端权威更新」
  永远理解一致。patch 浅合并一层（model.cost / thinkingBudgets / compaction / retry 会被展开合并）。

### 5.4 状态 / 资源 / 会话列表（state.ts）

- **UsageTotals**（会话语义总计）与 `EMPTY_USAGE_TOTALS`。
- **QueueName**：`steering | followUp`；`QueuedMessagePreview`：排队条目的预览文本。
- **CompactionState**：generation / summary / tokensBefore / foldedMessages / createdAt。
- **ToolApprovalRequest**：approvalId / toolCallId / toolName / args / **summary**（渲染成用户看得懂的
  命令或路径）/ readOnly / requestedAt。
- **ToolApprovalDecision**：`allow | allow-always | block | block-and-stop`(+reason)。
- **StopReason**：`max-turns | context-limit | user-requested | tool-terminate`。
- **AgentStateSnapshot**（最重要）：会话语义真值，二分为
  - 镜像 `Agent.state`：systemPrompt/thinkingLevel/toolNames/messages/isStreaming/streamingMessage/
    pendingToolCalls/errorMessage；
  - runtime 记账：workspace/supportedThinkingLevels/hasQueuedMessages/queued/turnCount/usage/
    contextTokens/contextWindow/compaction/aborting/stopRequested/transcriptPath/pendingApprovals/
    sessionId/config。
- **资源**：`SkillInfo`、`PromptTemplateInfo`、`ToolDescriptor`、`ResourceDiagnostic` 汇总成
  `SessionResources`。
- **StoredSessionInfo**：磁盘历史会话元数据（会话库列表项）。
- **工作区/目录**：`DirectoryEntry`、`DirectoryListing`（一层：只列目录 + 文件数；提示是否真工程）、
  `WorkspaceValidation`（exists/isDirectory/writable/problem）、`ModelInspection`
  （supportedThinkingLevels + 凭据来源自检，供「测试模型」按钮）。

### 5.5 网络协议（wire.ts）

两个事件字典 + 一组辅助类型，从类型上让 server 和 UI「不可能对不上」。

**请求（ClientToServerEvents）**

| 事件 | 语义 / ack |
| --- | --- |
| `session:open` | 打开/重挂/resume；ack `{state,resources,reattached}` |
| `session:close` / `session:state` | 关闭 / 拉快照 |
| `session:prompt` / `continue` / `steer` / `followUp` / `clearQueue` | 对话五入口（见下文 7.5 Composer） |
| `session:abort` / `requestStop` | 立刻中止 / 优雅停止(可 cancel) |
| `session:reset` / `setMessages` / `truncate` / `compact` | 摘要/重写相关 |
| `session:configure` | 配置补丁；ack 快照（服务端可 clamp） |
| `session:runSkill` / `runTemplate` / `reloadResources` | 运行/重载资源 |
| `workspace:browse` / `validate` / `switch` / `recent` | 工作区选择 |
| `tool:approve` | 审批决策 |
| `sessions:list` / `delete` | 历史会话库 |
| `model:inspect` | 验证模型（支持哪些 thinking、凭据从哪拿） |

约定：**会启动 run 的操作 ack「run 已排上」就返回**（不阻塞），run 结束由广播 `session:runEnd` 送出；
纯同步操作干完活才 ack 快照。

**推送（ServerToClientEvents）**
- `ready`：建连首帧，携 runtime 事实与 `liveSessionIds`（供空窗口收养活会话）。
- `agent:event`：逐条 AgentEvent + 会话内单调 seq。
- `session:state` / `runEnd` / `resources` / `compacted` / `stopRequested` / `turnPrepared` /
  `workspace` / `closed`。
- `tool:approvalRequest` / `approvalResolved` / `resultAdjusted`。
- `debug:payload` / `debug:response`（开 `debugPayloads` 时抓 provider 报文）。
- `log`：runtime 日志行（进 UI 通知）。

另：`PROTOCOL_VERSION = 3`（变了 UI 报「协议不匹配」）、`RUNTIME_PORT = 7821`、
`Result<T> = ok/fail` 与类型化广播 `ServerEmit`、`FALLBACK_THINKING_LEVELS=["off"]`。

> **结论**：protocol 是整个系统的「词汇表 + 宪法」。读懂它就读懂了 runtime 想做什么、desktop 想呈现什么。

---

## 6. 上层详解 B —— 运行时 sidecar（runtime）

`packages/runtime` 的 `index.ts` 注释给了清晰分层，我把它扩成地图：

```
server/        Socket.IO 传输、rooms、模块化事件处理
  ├ context.ts  共享上下文 + guard(ack 恰好一次)
  ├ index.ts    起 http + socket.io、注册 handler、收尾
  └ hub.ts      SessionHub：活会话 + rooms 的所有权
session.ts     一个 AgentSession：每个 Agent hook/方法都接好
model.ts       从 ModelSpec 建立 ModelRuntime
tools.ts       依设置 buildTools（绑定共享 ExecutionEnv）
compaction.ts  在 Agent.transformContext 上做自动摘要（fold 桥接）
persistence.ts JSONL 会话存储（resume + 历史库）
workspace.ts   解析/校验/浏览工作目录
conformance.ts 编译期证明 wire 与库一致
```

顺序 6.1 server → 6.2 hub → 6.3 AgentSession → 6.4~6.6 子模块。启动入口 `cli.ts` 读
`PINE_RUNTIME_PORT`（默认 7821）→ `createRuntimeServer(port)` 常驻。

### 6.1 server/context + index：建连接与整套收尾

- **context.ts** 定义 `SharedContext {hub, io, store}`，派给各 handler module，保证所有 handler 共享
  同一个 hub/store 单例，谁都能发广播。
- `guard(ack, run)`：把 run 包成 async IIFE，成功 `ack(ok(...))`、失败 `ack(fail(error))`。保证
  「ack 恰好一次」，客户端不会因 promise 被拒而干等。
- **index.ts** `createRuntimeServer(port)`：
  1. `createServer()` + 包一层 socket.io：`cors:{origin:"*"}`（dev/WebView 与 sidecar 非同源，只能宽容；
     loopback 所以安全）、`connectionStateRecovery:{maxDisconnectionDuration:2*60_000}`、
     `maxHttpBufferSize:32MB`（长 transcript 报文）。
  2. 建 SessionStore/SessionHub，组 `RuntimeContext`。
  3. 每个 socket 连接：先注册 handler module `[session, workspace, library]`，**最后** `emit("ready")`，
     保证客户端对 ready 的任何反应都能被 handler 接住。
  4. `listen(127.0.0.1)`；端口被占**安静退出**。
  5. SIGINT/SIGTERM：`closeAll → io.close → exit`。

### 6.2 hub.ts —— 活会话与 room 的所有权

`Session` 比 socket 活得久，由 `SessionHub` 管。`Map<id, AgentSession>` + rooms。

- `liveIds()`：随 `ready` 广播的活会话 id。
- `open(socket, req)` 三种情形：
  1. id 在 live → join room 重挂，`{state, resources, reattached:true}`。**重挂方持过期配置也无妨——
     以活会话自己的配置为准**。
  2. id 不在 live → 从磁盘 resume（`resumeSessionId`）。
  3. 无 id → 新建（`uuidv7`）。
- `emitterFor(id)`：绑 room 的类型化广播；会话内部按事件名发，不管 room。
- `close(id)`：先移出 map（防并发复活）→ `session.close()` → 广播 `session:closed` → 清 room。
- `closeAll()`：关机 abort 所有 run、flush、settle。

### 6.3 AgentSession —— runtime 的胶水心脏（session.ts）

信息量最大的文件。要点：**只改 runtime，不改上游**。创建 `Agent` 时几乎每一条 `AgentOptions` 钩子
都绑到私有方法：

| Agent 钩子供入 | AgentSession 实现 | 作用 |
| --- | --- | --- |
| `initialState` | 组 systemPrompt + model + clamp thinking + tools + restored 消息 | 拼初态 |
| `streamFn` | `modelRuntime.models.streamSimple(...)` | 锁死用法 |
| `convertToLlm` | 转发 `@pine/agent` | harness 特有 role 归一 |
| `transformContext` | 见 6.5 | 自动压缩 |
| `getApiKey` | `resolveApiKey()` | env 回落 + 占位 key |
| `onPayload`/`onResponse` | 开 `debugPayloads` 才广播 | 抓包 |
| `beforeToolCall` | 审批策略 + bash 黑名单 | 人机权限闸门 |
| `afterToolCall` | 超长工具结果截断 + terminate 检测 | 节水 |
| `shouldStopAfterTurn` | 优雅停止策略 | 停止决策 |
| `prepareNextTurnWithContext` | 把 run 中途改动在下一轮生效 | 延迟应用 |

**initialize()**（构造时按序）:
1. `createModelRuntime(model, apiKey)`
2. `loadResources()`：读 skills / prompt templates
3. `openPersistence(resumeId)`：能 resume 则用 `restoreSession` 出的消息、thinkingLevel、激活工具集
   去 seed，并把 `config.tools.enabled` **对齐到恢复当时的激活集**（避免历史会话突然多出当时被关的工具）。
4. `buildToolSet` 构造工具集 → `new Agent({ ...上述选项 })`
5. `agent.subscribe(onAgentEvent)` 转成 `agent:event` 广播。

**onAgentEvent 转发与低频收尾**：
- 每条事件 `seq++` 广播 `{sessionId, seq, event}`。
- `message_end` → JSONL 落盘；assistant 则累计 usage；`publishState()`。
- `message_start` → 若这条 assistant 本在"排队预览（将被 drain 的 steer/followUp）"就移除预览。
- `turn_end`/工具起止/agent start/end → `publishState()`。
- **刻意不幸 flush 的高频**：`message_update`、`tool_execution_update`。注释点明：UI 拿事件本身增量
  补画面即可，再发一遍快照会白付一倍成本。

**审批与工具策略（beforeToolCall/afterToolCall）**
`beforeToolCall` 是人机权限闸门，顺序：
1. bash 先 `matchBlockedPattern(command)`（正则，大小写不敏感；非法正则吞掉不崩）→ 命中即 block。
2. approvalPolicy=`auto` → 放行。
3. readonly 且非只读工具 → block（只读模式）。
4. `autoApprovedTools` 有名 → 放行（默认含 read）。
5. ask-writes 且只读 → 放行。
6. 否则 `requestApproval` 构造 `ToolApprovalRequest`（summary 用 `summarizeToolCall` 渲染），挂到
   `pendingApprovals`，广播 `tool:approvalRequest`，**等 UI 的 `tool:approve`**（支持 abort，run 中止自拒）。
   `allow-always`：动态写进 `autoApprovedTools` 再广播新快照。
   `block-and-stop`：`{block:true, terminate:true}`。

`afterToolCall` 节水：terminate true → 记 `tool-terminate`；文本超 `maxToolResultBytes` → 保尾截断 +
  追加脚注、置 `details.pineTruncated`、广播 `tool:resultAdjusted`。

**停止**：`requestStop(cancel)` 置 `stopRequested`（turn 边界优雅停）；`abort()` 立即取消。`shouldStopAfterTurn`
还查 `maxTurns`（≥报 `max-turns`）与 `stopAtContextFraction`（上下文占用比例，报 `context-limit`）。

**startRun(run)**：run 是异步尾随的，**立即 return**（socket ack 早回）；run 结束 finally 里广播
`session:runEnd {stopReason?,errorMessage?}` 并 flush 快照——即两段 ack 哲学。

**configure（配置可在忙时"延迟到下一轮"）**：
`configure(patch)` 用 `DeferredTurnUpdate`（model/thinkingLevel/tools/systemPrompt 四标记）：
- 空闲 → 直接同步 `agent.state`；
- busy → 置 deferred.*，`prepareNextTurn` 在下轮边界应用并广播 `session:turnPrepared {changes}`；
- 支持改工作目录 `rebindWorkspace`（见 6.6）。
- **cwd 不允许在此改**：UI 的 `applyConfig` 有意剥掉 cwd，只留给 `workspace:switch`，防过期草稿把已切目录改回去。

`snapshot()`：拼 AgentStateSnapshot；`queued` 只在 `hasQueuedMessages()||isStreaming` 才给 preview，否则空
（避免 idle 时残留假 queue 徽标）。`publishState/resource/reset/truncate/compactNow` 各司其职后 rotate 持久化。

图片处理 `acceptImages`（模型不支持就丢弃并 warn）、`accumulateUsage`（assistant 消息粒度累加）。

### 6.4 model.ts —— 模型运行时

**关键：不依赖生成目录**。`createModelRuntime(model, apiKey)` 在内存构造 `MutableModels` 并按 ModelSpec 即时建 provider：
- `API_FACTORIES` 只存 4 个可用 API 的 `.lazy` 构造，避免把 provider 源码打进 bundle。
- `API_KEY_ENV_VARS`：不同 api 看哪些环境变量回落密钥。
- **占位 key `"pine-local"`**：本地类服务器（Ollama）会拒空 Authorization 头但接受任何非空串。
- `apply(spec, apiKey)` 热换模型；`supportedThinkingLevels`/`clampThinking`：用模型元数据把用户高选压到合理区。
- `buildModel(spec)` 产出 `Model<Api>`（input 只 text / tool calls——供应商 image 支持由 acceptImages 把关）。

### 6.5 tools.ts + compaction.ts —— 工具集与自动压缩

**tools.ts**
- `buildTools(...)`：给每个启用工具 `bind(executionEnv)`，生产就绪工具返回给 Agent。
- **`finish` 的封装**：真正的 done 是把 `AgentToolControl` 传过去触发终止——副作用被限制到一次
  （run 已不活跃就退化为 no-op 返回）。`finish` 关闭时被剔除，Agent 就不必知道外部禁用。
- `executionEnv` 共享给所有工具：工作目录、提示、绝对路径守卫、`tool:approvalRequest` 广播回调、运行 dir。
- 工具结果统一 `clampOutput`；`bashExecution` 系统消息交给 Agent → tools/Agent 才可能无 diff run。
- `summarizeToolCall`（给审批 UI 读的命令/路径摘要）/ `toolResultText`（给节点折叠挑文本）。

**compaction.ts** —— 在 `Agent.transformContext` 之上做自动摘要，不上游加逻辑。
- 核心困难：上游 `compact/prepareCompaction` 吃 `Entry[]`，而钩子 `transformContext` 吃
  `AgentMessage[]`。`CompactionFold` 做桥梁。摘要前的消息可由 `buildFoldEntries(fold, messages)` 重建为
  合成 entry 列表（前面一个 compaction 摘要 entry + 后面的 live tail），从而让 `prepareCompaction`
  能看到上一次摘要、链式压缩而非从头再来。
- `isFoldApplicable`：fold 在 transcript 缩短后即失效。
- `foldedMessages`：**模型看到的上下文** = 摘要替掉折叠前缀。
- `runCompaction`：prep → compact → 产出下一世代的 fold（generation +1、foldedCount、usage）。

### 6.6 workspace.ts + persistence.ts

**workspace.ts** 路径处理（平台正确的绝对路径、`workspaceLabel` 给标题取 basename）：
- `resolveWorkspace(path)`：候选全 join；默认 cwd；不存在改用 PINE_SESSIONS_ROOT 或 tmp。
- `validateWorkspace(cwd)`：探查目录存在/可写/是否有明显的"项目"味道。
- `browseDirectory(path)`：列出这一层子目录（`skipUndesirables` + `.gitignore` 排除），给文件数与是否根。

**persistence.ts**（JSONL）：`SessionStore` 在 `PINE_SESSIONS_ROOT`（默认 `~/.pine/sessions`）：
- `defaultSessionsRoot` / `open` / `list`（完整 StoredSessionInfo 元数据，防个别会话损坏整表崩）。
- 每会话一个 `<id>.jsonl `，`openSession` 定位文件并以**create+flush/append**恢复上次结尾。
- resume 用 `restoreSession(handle)`（核心读）与 `restoreSessionStateMessages`。
- `append` 原子追加；`clear/truncate/rotateFiles/bumpSeq`；`close` 里 flush。

### 6.7 conformance.ts —— 无运行时代价的"漂移刹车"

利用 TS 类型系统做方向性 assignability 断言：
- runtime **发布**出去的（agent→wire）：当库值需装进 wire 类型；
- 客户端**供给**的（wire→agent）：`WireUserMessage`、`ImageContent`、Transport、Thinking…等。
- 唯一**故意不双向**：`AssistantMessage` 的 api/provider 在 wire 是 string、库是 union，恢复 transcript
  需要一次强制转换——全部收敛进 `toLibraryMessages` 一个地方（异常显式可见）。

### 6.8 smoke.ts —— 端到端冒烟（不在桌面，但能帮你观察）

起真实 Socket.IO + 真实 AgentSession + 一台**假模型**（`testing/fake-model.ts`），逐能力断言并 self-contained。
`pnpm --filter @pine/runtime smoke`。适合速览协议层每一个请求/广播的真实行为。

---

## 7. 上层详解 C —— 桌面 UI（desktop，前端）

> 用户要求**上层应用极致的详细**，故本大节是全文最长、最细的部分。代码全在
> `apps/desktop/src/`。文件树如下，之后逐个拆：

```
src/
  main.tsx / App.tsx           入口与整体装配
  App.css                      少量全局 css
  i18n/                        微型类型安全 i18n
  theme/                       光照/暗黑 token
  lib/                         纯函数工具（format 等）
  config.ts / .env 之类        构建期常亮
  store/
    index.ts                   configureStore（9 个 slice） + 根 reducer/selector
    hooks.ts                   类型化 useAppDispatch/useSelector
    slices/                    每个领域一个纯 reducer + selectors（缓存值常量单例）
    actions/                   所有"副作用 + 广播桥"的 thunk
  socket/
    client.ts                  单例 socket.io-client 封装
    bridge.ts                  广播 → 各种 slice action 的分发
  components/
    shell/      Topbar.tsx
    config/     ConfigPanel.tsx + options.ts + 若干 sibling
    transcript/ Transcript.tsx / MessageBlock.tsx / ToolCallBlock.tsx / Thinking.tsx 等
    composer/   Composer.tsx
    approvals/  ApprovalBar.tsx
    workspace/  WorkspacePicker.tsx
    inspector/  InspectorPanel.tsx + SessionsTab/StateTab/ResourcesTab/DiagnosticsTabs/ProfileView
    notices/    Notices.tsx（toast）
    primitives/ Button.tsx Field.tsx Surface.tsx Spinner.tsx Text.tsx Badge.tsx 等（design system）
    activity/   ToolActivity.tsx
```

### 7.1 装配主线：main.tsx → App.tsx

**main.tsx**（`createRoot(<App/>)`）：
- 优先级：挂页面 **前**就 `dispatch(hydrateUi())`、读 `detectLocale()`。
- 包 `ThemeProvider`（`theme/`）使 styled-components 能吃 tokens。

**App.tsx**（顶部 HUD 层叠顺序 = 责任顺序；**位置先 → 底层，后 → 顶层弹出层**）：
- 挂 `useConnection()`/state；读 slice：`sessionBusy`、`liveId`、`hasSession`、`pendingConnection`。
- 无条件渲染：`Background`（居中边框面板）+ `NoConnectionView`（断线全屏占位，插到背景前）
  + `useEffect`（`hasSession` false 但 `connecting || connectionAttempts===1` 时轮询等待）
  + `PromptChip`；- 排片：
  - grid：左 ConfigPanel / 中(Composer+Transcript)/ 右 InspectorPanel
  - Composer 上层：ApprovalBar（pending 时顶到输入框上方）
  - 全局底层：ToastHost（右下）、BusyOverlay、GlobalToolActivity（左下活动条）
  - 全局顶层：WorkspacePicker modal、SettingsDialog、ConfirmLogout、ModelPicker
- 顶部状态条字段：config dirty、context split（`contextTokens/contextWindow` 占位显示）、
  connection 状态、会话 idle/busy。滑条上右端**轻量**提示超窗口危险。
- show idle `session:state` 可从 `sessionBusy` 派生。

### 7.2 store：入口与 9 个 slice（index.ts）

`configureStore` 接 9 个 reducer，并 preloaded `initialHydration`。

slice 一览：

| slice | 职责 | 略述 |
| --- | --- | --- |
| `connection` | 到 sidecar 的连接状态机：status 四种（disconnected/connecting/connected/error）, autoReconnect |
| `config` | 配置草稿（draft） + appVersion；`isDirty` |
| `session` | 会话快照真值映射、策略：queue 派生、待批推导、`liveSessionIds` |
| `transcript` | 由**事件**驱动的可渲染列表项 + snapshot id 断言 |
| `approvals` | pending 审批列表、deciding（正在决策中禁按钮） |
| `workspace` | picker 模态状态、目录漫游、recent、切换中 |
| `library` | skills / prompt templates / cwd 存取、persisted 记录 |
| `debug` | debug tab 的 payload ring buffer、`debugPayloads` 开关 |
| `ui` | 语言/主题/重置、tabs、历史展开态 |

跨 slice 的惰性取值被集中成 selectors（例如 pending approvals 需要 session 真值可用才非空）。
store 从不保脏 patch。**单一 dispatch 入口点就是 actions/ 的每个 action creator**。

### 7.3 store/slices —— 状态模型精读

> 我不逐字段铺开，挑**最容易写错/最难懂**的交代。字段名几乎都照映 protocol。

**connection.ts**
- `status`：disconnected/connecting/connected/error；`wasConnected`/`autoReconnect`。
- `connectionAttempts` 递增（App 用它在第一次失败后自动窗口置位）。
- selectors：`selectWasConnection`（在 NoConnection 与重试逻辑用到）。

**config.ts**（草稿）
- `defaultConfig`（从 `mergeConfig` 造的 defaults）、`draft`、`appVersion`。
- 该 slice 是"本地草稿编辑"中枢：所有字段的 setter 都是纯 dispatch（不触发提交 / 不碰本地存储）。
- selectors 含 config 的"原始/翻译态"副本、cwd 快照。

**session.ts**（快照")
- 最复杂。key 概念：
  - `session`: 最近一次快照的 **原始结构**子集（`AgentStateSnapshot` 原样放）；
  - 派生 cache（derive separately）：queue 预览、待批、上下文占用、running/conversation 状态；
  - **`liveSessionIds`**（从 `ready` 读）。
  - `resumeError`、`showEndBanner`。
- queue：`hasQueuedMessages` / `queuedMessageList`（渲染队列 pin）用 settings+isStreaming 时才给出。
- 快照**永不写盘**；它是「服务端每一次权威广播」的落点。

**transcript.ts** —— 事件驱动渲染的首源
- **为何存在**：真实 UI 事件逐发，而"渲染条目"需要在**顺序/去重/分组**上做轻微整理（例如一条
  assistant 消息的 thinking/text 显示分行、把 bashExecution 跟用户请求粘行为一块）。
- 数据形状：`array of transcript items { id,type,role?,display,content?,meta? , timestamp}`；
  同一 assistant 条随着每次 message_update 被**原地替换**成新内容（key 稳定 = `assistantMessage.id`）。
- **快照落地**：收到 `session:state`（含快照）时把 snapshot.messages 转换后整体替换。
  该函数仅在 bridge 判 `message_change <-> event 不同类型`时相互兜底（任何一次成功连接先到快照
  → append 收编 event；只有连接全是 event 的时刻才靠时间戳/seq 顺序）。断言安全做在 messageCache 里。

**approvals.ts**
- `approvalId` 唯一。pending 依赖 `session.available` 才判定非空。
- `deciding`: dispatch 决策后先置入，禁 double-handle；服务端再广播 approvalResolved 清掉。

**workspace.ts**（浏览/被选 vs 被检）
- `pickerOpen`、`listing`（正在浏览目录）、`recent`、`validation`、`showHidden`、`switching`、`selection`、
  `error`。（会话运行中禁止切 "workspace" → 通过 dispatch 到 sessions 的 guards。）
- recent 持久化到 localStorage（近期目录）。

**library.ts**
- `skills`/`templates`：服务端 `resources` 的 `SkillInfo[]/PromptTemplateInfo[]`。
- `ownedPersisted`：据源持久化的 skills 与 templates（自己创建的那些）。

**debug.ts**
- **payload ring buffer**（限长 N），debug tab 与 "捕捉 payload" 用。
- 项里有 `direction`（request/response）、transport、`kind`…。

**ui.ts**
- locale / theme；tabs（config open/inspector tab 树）、collapsed（历史折叠）map；
- `toastIds` 等（Notices 用）。

### 7.4 store/actions —— 所有副作用与"到 socket"的门面

> 浏览器**不直接碰 socket**；一切 socket 发包都经 actions/。它是整个 desktop 逻辑的心脏。所有 action
> 在 head 先 dispatch_local state（乐观更新），**最终以一个 ack/拒的 thunk 收口**。下面挑最核心。

**shared.ts** —— 基建
- `hydrateUi()`：进入时从 localStorage 恢复 ui 偏好 + `.env` 版本兼容检查。
- `handleReady/onReconnect`（connection state 驱动）：广播后补 open session（见连接生命周期）。
- `emit/systemOf` helpers：包 `Result` 的 throw 注入与错误 toast（日志由 Notices 自己读）。

**session.ts** —— 会话相关请求
- `openSession(req, opts)`：真正驱动创建会话：
  1. 若 `requestCtx.agentReady` 或者已有会话 → `session:open`；
  2. 先 `dispatch(resetStatus…)` 争取「刚 open 即拿到 state」；
  3. ack `{state,resources,reattached}`：**session 有快照就设置，没就再主动拉 state**；
  4. 若 snapshot.config.cwd 与 workspace 不匹配 → 平行刷 workspace；
  5. 结尾 ensure ws catalog（`pushDirectory(stored)`回 recent）。
- open（id 的）`dispatch(openSession({resumeSessionId}))` → 加载历史。

- run 类（`.run/continue/steer/followUp`）很相近，共同点：本地**先** 判定状态合法：
  - idle 下用 `fire`（后面描述“先申请”“后 ack”）；
  - 未连到 runtime → toast 提示等连上；

  细节差异：
  - `continue` 只允许在**转录当前无 run** 时执行；有 run → toast（"已在跑"）。
  - `steer`/`followUp` 在**running**时 accumulate 到 `followUp` 排队；
  - `requestStop`：IDLE（前端记录 stopRequested）时也允许（stop 已在 idle 显示但没到底端才有意义）。

- `resetTranscript`/`clearTranscriptRotation`、`routeSetRecords`、`dispatchCompactNow`：
  回写后由服务端 ack 决定改 workspace/session 等的顺序。

- `decideApproval(id, decision)`：本地把 `approval` 移进 deciding → `tool:approve`，服务端 ack
  新快照后从 pending + deciding 清。**allow-always** 会把该 toolName 写进去已批准策略集——但因为每次仅对当次，
  会把 autoAllowed 写入本次会话的 approve->awaiting，下次再造不会默认。

- `loadRecentWorkspaces+browseDirectory` 等只是 workspace 的快照式 fetch。

**shared actions 的重要 helper —— `applyConfig`（config 提交，服务端权威化)**
流程：
1. 原样 merge draft+env（cwd 交给 workspace 专用，见前）。
2. `session:configure`（带 diff），等 ack 快照（服务端已经把 clamp、autoApproves 什么的算好）。
3. 写 localStorage `pine.config.v3`（draft 快照）。同时更新 session 快照。
4. 因可能的 model/路由热换，触发"需要重新 build 的列表"（refreshInspectorTabs）。

**workspace.ts**：`switchWorkspace` 是"专用 cwd 入口"——先 `validate`+`browse` 再 `session:configure
{cwd}` 或直接 `switch`、重拉 skills/resource；本地 recent 写盘。

**library.ts**：skills/templates 的 load/reload/打开创建、run/save；`setTemplate` 前先与本地去重。

> 至此已足够读通 bridge 能看到桌面如何"一口一帧"地维持服务端权威。

### 7.5 关键窗口级组件（JSX 行为）

**Topbar.tsx**
- 顶部横向条：左标题「Pine」+ 状态点(绿=connected/黄=reconnecting/灰=disconnected)；中央
  cwd breadcrumb（点击 → WorkspacePicker）；中右 session idle/progress。右侧：设置(齿轮)、语言切换、
  主题切换、新建会话(?) + 离开(断开)按钮。
- 状态点数据源全都是 connection slice。

**Composer.tsx + Prompt/… inputs** —— 中下层输入
- 三种真实输入：text 助手、prompt template picker、skill chip。
- 若 approved（approval）亮起时按钮禁用——await approval 确认。
- textarea（autosize）+ 发送；Enter=发送（Shift+Enter 换行）。发送即 dispatch(dispatchPrompt)；
  空内容禁用。attach 空格换行都行。运行时用户还能从 command/p指令。

**Transcript.tsx** —— 中枢滚动窗口
- 负责拼装会话里所有顺序消息。头部渲染会话 label+控制；`items` 来自 transcript slice。
- **滚动策略**：新消息自动滚（用户手动上翻时 60% 停顿底标记再回到底）。
- empty state：有会话但无消息 → 显示 Intro / 提醒开 skills。

**MessageBlock.tsx**
- 单条可折叠块。role 决定横竖/颜色/label。组装 thinking（可折叠/同步）、text、附件、toolcalls。
- badge 显示 toolcall 结果、truncated 提示。

**ApprovalBar.tsx**（approvals/）—— 每次上面(第 6.3)的审批
- pending approval pinned 在 Composer 上沿的黄色警告条。展示 tool 摘要/args；
  四按钮：Allow once（Primary）/ Always / Block / Block-and-stop（危险）；
  附加 reason 文本框（只有 Block 类决定才发 reason）。
- 只把"一个 approval"asking (仅那支 tool)；多个 pending 会逐个渲染、会叠按钮。
- busy 用 `deciding` 置灰禁连点。消失：approvalResolved/决定即刻。

**Notices.tsx（toast host）**
- 从 ui slice `toastList` 迭出；自动消失/手动点掉。桥那边 network error、代理决定被人化等落这里。

**ToolActivity.tsx** —— 常驻在 Transcript 左下活动小横幅
- 读 `session.streamingToolCall` 的 dispatch；显示「正在调 <tool> <summary>」。空闲不显示。

**BusyOverlay & Spinner**
- session run busing 时给可点击 overlay 挡住误操作把画面冻掉，BusyOverlay。其余随时 spinner 用 primitives/Spinner。

**WorkspacePicker.tsx** —— 目录选择器模态
- bootstrap 三种进入：
  1. 直接打路径（path input, blur 做 inline validation）；
  2. 沿树漫游目录（listing 拉一层只列 dirs; 空格块 up/.. 退回；toggle showHidden 重拉）；
  3. 直接点 recent chip。
- 最后 Foot 显示 target 路径 + Choose 按钮(switching 时 disabled)。Backdrop 仅点到背景才关。
- 注释强调**不用原生对话框**是为了「同一组件在 dev server 与 Tauri 里都工作」，而且展示的路径就是工具
  实际所见。

**ConfigPanel.tsx**（左栏，宽列）—— 模型/行为配置面板
- 顶层按钮：Start/Close session(依据状态)、Apply、Reset。
- 大部分字段存 `draft`;只有点 Apply 才提交到服务端(localStorage 落点)。
- 分行小节点块 + 折叠：
  - Model：模型选择器（provider + model + reasoning + 温度）; link 到 model picker。
  - 会话行为：approval policy select、auto-approved tools（multiselect）、queue 行为。
  - 工具切块：每工具开关 + 权限: display bash 的 allowlist。
  - 高级：context window cap、thinking 档、truncate 策略、run 参数。
- Dirty 徽标在Topbar 与 ConfigPanel 同步显示；没 apply 前切模型不逃逸。

**InspectorPanel.tsx**（右栏，tab 化）
- 数据仍全从 store selectors（无额外请求 loop）。tab 树：
  - **StateTab**：会话语义快照(usage/context/queue/compaction)读给你；
  - **ResourcesTab**：skills/templates/tools/diagnostics（cwd workspace badge）；
  - **SessionsTab**: 历史 stored 会话列表(recent ls + 重开/删除);
  - **DiagnosticsTabs**: 原生 log Level filter + 关键字 filter + payload ring（debug slice）。
  - **ProfileView**: 各种库/本地设定 viewer，点开后只读 JSON。

**SessionsTab / StateTab 细讲**（inspector 常用两个）：
- SessionsTab：tree 语义 —— 新键列表带 `resume`、`delete`，顶部 folder 可"clear history"警告。逐会话
  显示 title/时间/用法。删除会话前要确认（避免误删 transcript 文件）。
- 状态当例子更能体现"全快照"，随时与你看到的 JSON 连线。

**primitives/（design system）**
- Button/ButtonRow、Field（input + label + error slot + toggle）、Surface/Stack/Axis/Row/Card、
  Text（$size/$tone/$weight capsule）、Code、Spacer、Badge、Divider、Spinner、LinkButton、IconButton、
  Progress、Tooltip。
- 多数是 styled-components，"$prop" 走 transient props（避免污染 DOM）。设计 tokens 全在 theme。

### 7.6 socket 层：client.ts + bridge.ts

**client.ts** —— 单例包装 + 断线/重连
- `connect()` 返回 / 暴露全局：给出端口(优先 `VITE_PINE_RUNTIME_PORT`，否则 rpcPort)。成立：
  - `io(url, {autoConnect:true, path:"/…", ackTimeout:…})`
  - `socket.io` events: `connect/connect_error/reconnect_attempt` 更新 connection slice（status 保持，
    toast on reconnect_failed）。
- `emit/emitAwait` helpers 帮 thunk 一面 `socket.emit` + 一面 `once("ack")` 与响应续桥。
- 关键：**socket 断开的瞬间 socketId 变了 → UI own socket.io-client 只会自己 notify;** desktop 无需它
  reconnect 语义，它自己处理 auto-reconnect。`ensureConnected` 仍在 actions 里被调：确认 'connected'
  后 dispatch 一个 `connectEstablished`（而它的 re 触发 session sync）。

**bridge.ts** —— 广播进 slice 的唯一入口
- `bindSocket(socket)`：把 socket.io **所有**推送归类：
  - `log`/`debug:*` → Notices/debug slice；
  - `ready` → connection + 也来 `onReady`（拿 live ids）;
  - `agent:event` → transcript（见上"事件 → 可渲染"）;
  - `session:state` → session(updateSnapshot) → 对 queued/approvals/usage 触发局部 selectors;
  - `session:runEnd` → transcript mark + flush sessionBusy（除 abort 都结束）。
  - `resources` → library;
  - `tool:approval*`/`resultAdjusted`→ approvals;
  - `workspace` → library/workspace sync;
- promise/async 之外都走 dispatch（纯同步分发最稳：无渲染间隙）。

### 7.7 i18n 与主题
**i18n**（i18n/）
- 极小且类型安全：`TRANSLATION_KEYS` 从根枚举，每个 locale 必须同一个 key 集（否则编译错）;
- `useTranslate()` 读 ui slice，返回带占位替换的 `t(key,{count…})` 纯函数。
**theme/**：.dark/.light 两个 tokens 对象，ThemeProvider 提供；切换进 ui slice; `styled` 组件经 `css`
  取 theme 来用 color/space/radius/font。残差（hard-coded px）只在数量有限的例外里出现（近似正确）。

---

## 8. 上层详解 D —— Tauri 外壳与 sidecar 打包

`apps/desktop/src-tauri/`（Rust + Tauri v2）。

### 8.1 tauri.conf.json 要点
- `beforeDevCommand`：起 vite(`--host 127.0.0.1 --port 5173 --strictPort`)；`devUrl: http://127.0.0.1:5173`
  开发时 WebView 指向 vite。
- `beforeBuildCommand`：**先** `node ../../scripts/prepare-sidecar.mjs` 再 `build`。frontendDist = `../dist`。
- `bundle.resources: ["resources/runtime/*"]` → 打包时把整个 runtime 资源目录塞进安装包。
- `bundle.targets: ["nsis"]`。

### 8.2 打包侧进程（prepare/bundle sidecar）
- `scripts/bundle-runtime.mjs`：用 **esbuild 把 `packages/runtime/src/cli.ts` 打成单个
  `apps/desktop/src-tauri/resources/runtime/pine-runtime.cjs`**（bundle 掉 agent/ai/protocol，含依赖）。
- `scripts/prepare-sidecar.mjs`：调 bundle-runtime + 把**当前 Node 可执行文件本体**复制到
  `resources/runtime/node(.exe)`（从而安装包自带 Node，用户无需装 Node）。检查 cjs 存在即成功。
- `scripts/check-sidecar.mjs`：用跟 Tauri 同款方式 spawn 打包后的 sidecar，驱动一条完整会话（断言通过才
 绿色通过），是发布前的回归闸门。

### 8.3 Rust 基座（lib.rs）—— 拉起 & 善后 sidecar
- 结构体 `RuntimeProcess(Mutex<Option<Child>>)` 管理子进程。
- `runtime_listening()`：尝试 `TcpStream::connect_timeout("127.0.0.1:7821")` 探活——**已在跑就不重复起**。
- `bundled_runtime_paths(app)`：取 `resource_dir()/runtime/{node|node.exe}` + `pine-runtime.cjs`。
- `start_runtime(app)`：spawn node + 脚本，stdout/stderr 都丢 null；Windows 用 `CREATE_NO_WINDOW` 防弹窗口；
  起进程前 `sleep(400ms)` 让 websocket 先绑好再让 UI 连；返回 `Some(child)`。
- `run()`：`setup` 里起 runtime 并把进程存进 managed state；在 `RunEvent::Exit` 里 `child.kill()` 清理——
  **保证退出时把 sidecar 一起带走**,不留孤儿进程。

> 意义：桌面只需一个二进制 + 内置 node + 内置 cjs，双击即跑、随主进程生死。

---

## 9. 一条消息的完整旅程

串一遍真正的数据流，把上面的碎片焊起来。

### 场景一：冷启动 → 空会话
1. Tauri 建窗 → vite 页面加载 → `main` dispatch `hydrateUi`（读 localStorage 偏好/版本）。
2. `connect()`：`io(127.0.0.1:7821)`，socket 状态更新 `connection.status=connecting`。
   同刻 Rust `start_runtime` 已把 sidecar 拉起来（未监听才起），Rust `sleep(400ms)` → 恰好让 UI 的
   首次 connect 就能撞上一个已就绪 runtime。
3. sidecar `.on(connection)` 先 register session/workspace/library handlers → `emit("ready", {liveSessionIds,…})`。
4. UI 收到 ready → connection slice = connected → 无活会话时 `openSession({})`。
5. sidecar hub.open：无 id、无 history → `AgentSession.initialize()`（createModelRuntime→loadResources→
   openPersistence→buildTools→new Agent→subscribe） → `uuidv7` → join room。ack `{state, resources, reattached:false}`。
6. UI ack 里取 state 写入 session slice（快照真值），并将 state.messages 灌进 transcript；同时从
   resources 填 library、拉 workspace browse 与 recent。

### 场景二：发 prompt 跑一轮 Agent（核心）
看世界从用户角度逐帧：
1. 用户点发送 → Composer empty 禁发。Composer dial `dispatchPrompt(text,cwd)`。
2. action 校验已 connected && 无 approval pending → `session:prompt`（ack）→ **先** dispatch 本地
   `optimisticUserMessage`（立即回显，不管网络）；`sessionBusy=true` 局部先置。
3. sidecar `session.prompt`：构造 user text, 把用户消息塞进 transcript + `agent.submitPrompt(...)`，回复
   （Promise）携带处理后 attach；run 一旦排入，ack `ok`。
4. UI ack → session slice.isStreaming/queued 刷新。
5. Agent 内部 loop：先 systemPrompt+user → LLM 吐 first turn_start。
   - runtime `onAgentEvent`：
     - `turn_start/agent_start` → 同步快照（广播 session:state)
     - `message_start` assistant → text message_end 都 JSONL、流式回来路径给 msg events；
     - 助理想调工具 → `message_end` assistant + tool_call block → `pendingToolCalls`；若需要审批 →
       `beforeToolCall` 发起 `requestApproval` → hub 广播 `tool:approvalRequest`。
6. UI bridge 收 `tool:approvalRequest` → approvals slice 有 pending → ApprovalBar 冒出来（拿 summary）。
7. 用户点 Allow once → `decideApproval`（本地 decided 置灰防连点）→ `tool:approve` → sidecar
   `beforeToolCall` 的 promise resolve → 工具真正在 ExecutionEnv 跑（读/写/回调）= ack ok/result。
   - 若是 bash 且结果巨大被截断 → `afterToolCall` 加脚注去 `resultAdjusted` 广播 → UI Toast 告知。
8. 工具结果返回 model → 第二轮。每一步的 `message_update` 不断经 bridge 打进 transcript，
   对应那条 assistant item 原地长肉（流式冒字）。
9. loop 停下：(a) 模型想 `finish` 或 (b) 到 maxTurns 或 (c) 用户点"停止"。
   runtime 发 `session:runEnd {stopReason}`。
10. UI bridge 清 sessionBusy、把 transcript 各自 finalize、flush queue pin。

### 场景三：中间杀进（steer / continue）
- run 在跑、键盘进 steered 问题 → Composer 抬起 `steer`；local action 把 text 塞进 followUp queue
  preview → `session:steer` → runtime 把消息排队（不打断当前 loop）→ run 的某次 `turn_end` 边界
  drain 时作为下一条 user 进 context；drain 那刻 UI 收到 snapshot 的 queued 减少 + 该预览项被转成真实 message。
- 点 idle 时的 Continue → 若 transcript 有还没 closed 的用户意（一轮结束停在 assistant）会 `session:continue`
  重建一轮下去。

### 场景四：离线 / 重连 / 换窗口
- 浏览器关掉 → socket.io disconnect；sidecar 里生活会话照跑。
- 同会话开第二个窗口 → `ready` 拿到的 `liveSessionIds` 含它 → 空窗口直接对该 id `session:open`
  → reattach（join 同 room），立刻 `session:state` 拿真值 + transcript 全量补齐。
- 断网 2 分钟内回来 → `connectionStateRecovery` 补房间与漏帧 → UI re-sync state。超过 2 分钟则重放
  session open/resume 后重跑。

---

## 10. 常见开发任务地图

按"你想改啥"快速定位改哪个文件（别碰 agent/ai）。

| 想做什么 | 改哪里 | 配套面 |
| --- | --- | --- |
| 加/改一个 socket 请求 | `packages/protocol/src/wire.ts`(事件签名) → runtime `server/handlers/*` → desktop `store/actions/*` + `socket/bridge.ts` | conformance 在 runtime 已挡一层；UI 端 bridge 接住 |
| UI 新增一种配置字段 | protocol `config.ts`(字段+默认+merge) → ConfigPanel/options.ts 渲染 → session/sessionConfigure 或 applyConfig | mergeConfig 两侧共用勿漏 |
| 改工具审批 UI 文案/交互 | desktop ApprovalBar + i18n dictionaries | summary 来自 summarizeToolCall |
| 加一个工具 | ①不能改 agent/ai——多半抽象到 runtime tools/env 之外的 exec；读 exec 文档确认语义 → runtime tools.ts 绑定 | — |
| 自动紧凑参数 | protocol CompactionConfig → runtime compaction/config | 触发在 transformContext |
| 修改流式展示/瞬滚 | desktop transcript + MessageBlock + Composer | 事件驱动 |
| 修改 WebView/壳行为 | `src-tauri` lib.rs/conf + tauri-plugin | — |
| 加 i18n key | desktop i18n/en-US.ts + zh-CN.ts(双加才编译过) | types 自动吃 key |
| 改主题 token | desktop theme/*.ts | styled components `$tone/$size` |
| 预览捕捉 provider payload | runtime onPayload/onResponse + debug slice(desktop) | env/UI 开关 debugPayloads |

**必读顺序建议**（读了这三份基本能改 80% 上层功能）：
`packages/protocol/src/wire.ts` → `packages/runtime/src/session.ts` → `apps/desktop/src/socket/bridge.ts`
（+ Actions 选读）。

**调试入口**：
- 浏览器 dev server 直接连本机 7821，Network inspector 能看 socket.io 报文;
- `pnpm --filter @pine/runtime smoke` 离线冒烟协议;
- 打开设备点测 Debug tab 有原生 payload ring + log filter。断连状态走 `app` 的 disconnect 让底带连回。

---

## 附：protocol 类型与上游库的口径（助你对照 conformance 的断言）

protocol 里照抄自上游尖的形状（都会在 conformance.ts 被断言）：
- 消息、AgentEvent、PromptTemplateInfo、Skill、QueueMode、ThinkingLevel、ToolExecutionMode、Usage、
  Transport、ImageContent。
- 唯一需要强行转的是 AssistantMessage 的 api/provider 字段（库是窄 union，wire 是宽松 string）——
  见 `conformance.toLibraryMessages`。

---

*本文基于仓库当前源码整理；若后续改动 schema `PROTOCOL_VERSION` 记得同步更新、本地端 version 检则自动预警。*
