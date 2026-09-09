# Pi Coding Agent SDK 接口文档

> 面向桌面端 / 自定义 UI 集成者。本文档覆盖 SDK 模式的全部核心接口，重点说明**如何完全不加载 Pi 的默认配置文件**，并逐一确认每个方法的入参与返回值。
>
> 包名：`@earendil-works/pi-coding-agent`
> 参考示例：`packages/coding-agent/examples/sdk/`

---

## 目录

1. [架构与入口](#1-架构与入口)
2. [快速开始（最小可用）](#2-快速开始)
3. [重点：不加载 Pi 默认配置文件](#3-重点不加载-pi-默认配置文件)
4. [createAgentSession 完整入参](#4-createagentsession-完整入参)
5. [AgentSession 完整接口](#5-agentsession-完整接口)
6. [模型与鉴权：ModelRuntime](#6-模型与鉴权modelruntime)
7. [会话持久化：SessionManager](#7-会话持久化sessionmanager)
8. [设置：SettingsManager](#8-设置settingsmanager)
9. [资源加载：ResourceLoader / DefaultResourceLoader](#9-资源加载resourceloader)
10. [事件流](#10-事件流)
11. [工具与自定义工具](#11-工具与自定义工具)
12. [扩展 / Skills / 上下文文件 / Prompt 模板](#12-扩展--skills--上下文文件--prompt-模板)
13. [会话运行时：AgentSessionRuntime](#13-会话运行时agentsessionruntime)
14. [完整桌面端集成示例](#14-完整桌面端集成示例)

---

## 1. 架构与入口

```typescript
import {
  createAgentSession,        // 工厂：创建单个会话
  AgentSessionRuntime,       // 会话运行时：支持 new/fork/switch/import
  createAgentSessionRuntime, // 运行时工厂
  ModelRuntime,              // 模型目录 + 凭证存储
  SessionManager,            // 会话持久化（文件 / 内存）
  SettingsManager,           // 设置（文件 / 内存）
  DefaultResourceLoader,     // 资源加载（扩展、skills、prompt、主题、上下文、系统提示词）
  defineTool,                // 定义自定义工具
} from "@earendil-works/pi-coding-agent";
```

调用关系：

```text
createAgentSession(options)
        │
        ├── ModelRuntime      ← 模型目录 + API Key / OAuth 凭证
        ├── SettingsManager   ← 压缩/重试/思考等级等设置
        ├── SessionManager    ← 会话历史读写
        ├── ResourceLoader    ← 系统提示词 / 工具 / 扩展 / skills / 上下文
        └── AgentSession      ← 最终产物：prompt / 事件 / 状态
```

桌面端只需要关心两件事：

1. **发消息**：`session.prompt(text)`，并通过 `session.subscribe(...)` 订阅流式事件。
2. **不加载默认配置**：显式注入内存态 / 自定义路径的依赖（见第 3 节）。

---

## 2. 快速开始

```typescript
import {
  createAgentSession,
  ModelRuntime,
  SessionManager,
  SettingsManager,
  DefaultResourceLoader,
} from "@earendil-works/pi-coding-agent";

// 1. 模型运行时：必须显式创建
const modelRuntime = await ModelRuntime.create();

// 2. 完全内存态 + 无磁盘资源发现（见第 3 节）
const settingsManager = SettingsManager.inMemory({ retry: { enabled: false } });
const resourceLoader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: "/my/app/agent",           // 不存在的目录也没关系，因为下面全部关闭了发现
  settingsManager,                     // 复用内存设置，避免 reload 读 settings.json
  noExtensions: true,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  systemPrompt: "You are a helpful assistant.",
  appendSystemPrompt: [],
});
await resourceLoader.reload();

const { session } = await createAgentSession({
  cwd: process.cwd(),
  agentDir: "/my/app/agent",
  modelRuntime,
  settingsManager,
  resourceLoader,
  sessionManager: SessionManager.inMemory(process.cwd()),
});

// 3. 订阅流式输出
session.subscribe((event) => {
  if (event.type === "message_update" && event.assistantMessageEvent.type === "text_delta") {
    process.stdout.write(event.assistantMessageEvent.delta);
  }
});

// 4. 调用模型
await session.prompt("列出当前目录下的文件");
```

---

## 3. 重点：不加载 Pi 默认配置文件

### 3.1 默认会加载什么

Pi 默认从以下位置读取配置。**SDK 模式下如果什么都不传，这些默认行为都会发生**：

| 默认位置 | 内容 | 默认行为 |
|---------|------|---------|
| `~/.pi/agent/settings.json` + `<cwd>/.pi/settings.json` | 全局 + 项目设置 | 合并读取 |
| `~/.pi/agent/auth.json` | API Key / OAuth 凭证 | 读取 |
| `~/.pi/agent/models.json` | 自定义模型 | 读取 |
| `~/.pi/agent/models-store.json` | 模型目录缓存 | 读取/写入 |
| `~/.pi/agent/SYSTEM.md`、`<cwd>/.pi/SYSTEM.md` | 系统提示词 | 读取 |
| `~/.pi/agent/APPEND_SYSTEM.md`、`<cwd>/.pi/APPEND_SYSTEM.md` | 追加提示词 | 读取 |
| `~/.pi/agent/AGENTS.md`、祖先目录 `AGENTS.md` | 上下文文件 | 向上遍历读取 |
| `~/.pi/agent/extensions/`、`<cwd>/.pi/extensions/` | 扩展 | 发现并加载 |
| `~/.pi/agent/skills/`、`<cwd>/.pi/skills/` 等 | Skills | 发现 |
| `~/.pi/agent/prompts/`、`<cwd>/.pi/prompts/` | Prompt 模板 | 发现 |
| `~/.pi/agent/themes/`、`<cwd>/.pi/themes/` | 主题 | 发现 |
| `~/.pi/agent/sessions/` | 会话历史文件 | 创建/写入 |

### 3.2 逐项关闭方案

| 默认文件/目录 | 关闭方式 |
|--------------|---------|
| `settings.json`（全局 + 项目） | `SettingsManager.inMemory({...})`，不传文件管理器 |
| `auth.json` | `ModelRuntime.create({ credentials: new InMemoryCredentialStore() })`，再用 `setRuntimeApiKey` |
| `models.json` | `ModelRuntime.create({ modelsPath: null })` |
| `models-store.json` | `ModelRuntime.create({ modelsPath: null })`（此时目录缓存自动内存） |
| `SYSTEM.md` | `DefaultResourceLoader({ systemPrompt: "..." })` |
| `APPEND_SYSTEM.md` | `DefaultResourceLoader({ appendSystemPrompt: [] })` |
| `AGENTS.md` 上下文 | `DefaultResourceLoader({ noContextFiles: true })` |
| 扩展 | `DefaultResourceLoader({ noExtensions: true })` |
| Skills | `DefaultResourceLoader({ noSkills: true })` |
| Prompt 模板 | `DefaultResourceLoader({ noPromptTemplates: true })` |
| 主题 | `DefaultResourceLoader({ noThemes: true })` |
| 会话文件 | `SessionManager.inMemory(cwd)` |

### 3.3 方式 A：DefaultResourceLoader + 开关（推荐，简单）

用开关关掉所有发现，只保留显式传入的内容：

```typescript
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";

// 模型：内存凭证 + 不读 models.json（modelsPath: null 时目录缓存自动内存）
const modelRuntime = await ModelRuntime.create({
  credentials: new InMemoryCredentialStore(),
  modelsPath: null,
});
// 运行时注入 API Key（不落盘）
await modelRuntime.setRuntimeApiKey("anthropic", process.env.MY_KEY!);

const settingsManager = SettingsManager.inMemory({
  compaction: { enabled: false },
  retry: { enabled: false },
});

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: "/my/app/agent",   // 目录可任意指定，因为已关闭全部发现
  settingsManager,             // 关键：复用内存设置，避免 reload() 读 settings.json
  noExtensions: true,
  noSkills: true,
  noPromptTemplates: true,
  noThemes: true,
  noContextFiles: true,
  systemPrompt: "You are a helpful assistant.",
  appendSystemPrompt: [],
});
await loader.reload();

const { session } = await createAgentSession({
  cwd: process.cwd(),
  agentDir: "/my/app/agent",
  modelRuntime,
  settingsManager,
  resourceLoader: loader,
  sessionManager: SessionManager.inMemory(process.cwd()),
});
```

> 注意：`DefaultResourceLoader` 构造时若**不传** `settingsManager`，会内部 `SettingsManager.create(cwd, agentDir)` 去读磁盘上的 `settings.json`。所以“零配置”场景必须显式传入内存 `settingsManager`。

### 3.4 方式 B：自定义 ResourceLoader（零发现，最彻底）

实现 `ResourceLoader` 接口，完全不走文件系统发现。这是 `examples/sdk/12-full-control.ts` 的做法，适合桌面端想要 100% 掌控、连 `DefaultResourceLoader` 的内部逻辑都不信任的场景。

```typescript
import {
  createAgentSession,
  createExtensionRuntime,
  ModelRuntime,
  type ResourceLoader,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";

const modelRuntime = await ModelRuntime.create({
  credentials: new InMemoryCredentialStore(),
  modelsPath: null,
});
await modelRuntime.setRuntimeApiKey("anthropic", process.env.MY_KEY!);

const resourceLoader: ResourceLoader = {
  getExtensions: () => ({ extensions: [], errors: [], runtime: createExtensionRuntime() }),
  getSkills: () => ({ skills: [], diagnostics: [] }),
  getPrompts: () => ({ prompts: [], diagnostics: [] }),
  getThemes: () => ({ themes: [], diagnostics: [] }),
  getAgentsFiles: () => ({ agentsFiles: [] }),
  getSystemPrompt: () => "You are a minimal assistant. Be concise.",
  getSystemPromptSource: () => undefined,
  getAppendSystemPrompt: () => [],
  getAppendSystemPromptSources: () => [],
  extendResources: () => {},
  reload: async () => {},
};

const { session } = await createAgentSession({
  cwd: process.cwd(),
  agentDir: "/my/app/agent",
  modelRuntime,
  resourceLoader,
  sessionManager: SessionManager.inMemory(process.cwd()),
  settingsManager: SettingsManager.inMemory(),
});
```

> `ResourceLoader` 接口成员（全部必填，见第 9 节）就是上述 10 个方法。自定义实现后，`cwd` / `agentDir` 不再参与任何资源发现。

---

## 4. createAgentSession 完整入参

### 4.1 函数签名

```typescript
export async function createAgentSession(
  options?: CreateAgentSessionOptions,
): Promise<CreateAgentSessionResult>;
```

### 4.2 `CreateAgentSessionOptions`

| 字段 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `cwd` | `string` | `process.cwd()` | 工作目录（自定义工具、会话命名等使用） |
| `agentDir` | `string` | `~/.pi/agent` | 全局配置目录。仅当 `modelRuntime`/`resourceLoader`/`settingsManager` 未注入时参与默认创建 |
| `modelRuntime` | `ModelRuntime` | 使用 `agentDir/auth.json` + `models.json` 创建 | 模型目录 + 凭证运行时。**桌面端建议显式创建** |
| `model` | `Model<any>` | 从设置/首个可用模型推导 | 指定模型 |
| `thinkingLevel` | `ThinkingLevel` | 从设置推导，否则 `"medium"` | `"off" \| "minimal" \| "low" \| "medium" \| "high" \| "xhigh" \| "max"`，会按模型能力收敛 |
| `scopedModels` | `Array<{ model; thinkingLevel? }>` | `[]` | 模型循环列表（Ctrl+P 等价物），配合 `session.cycleModel()` |
| `noTools` | `"all" \| "builtin"` | 无 | `"all"` 关闭全部工具；`"builtin"` 关闭默认内置工具但保留扩展/自定义工具 |
| `tools` | `string[]` | 设置里的 `defaultTools`，否则 `["read","bash","edit","write"]` | 工具白名单（跨内置/扩展/自定义） |
| `excludeTools` | `string[]` | 无 | 工具黑名单，在 `tools` 之后生效 |
| `customTools` | `ToolDefinition[]` | `[]` | 自定义工具定义（`defineTool` 产物） |
| `resourceLoader` | `ResourceLoader` | `DefaultResourceLoader` | 资源加载器。桌面端不加载默认配置时注入自定义实现 |
| `sessionManager` | `SessionManager` | `SessionManager.create(cwd)` | 会话持久化。用 `inMemory` 关闭落盘 |
| `settingsManager` | `SettingsManager` | `SettingsManager.create(cwd, agentDir)` | 设置管理器。用 `inMemory` 关闭读盘 |
| `sessionStartEvent` | `SessionStartEvent` | `{ type:"session_start", reason:"startup" }` | 扩展启动事件元数据 |

### 4.3 返回值 `CreateAgentSessionResult`

| 字段 | 类型 | 说明 |
|------|------|------|
| `session` | `AgentSession` | 会话实例（核心对象） |
| `extensionsResult` | `LoadExtensionsResult` | 扩展加载结果（`{ extensions, errors, runtime }`） |
| `modelFallbackMessage` | `string \| undefined` | 恢复会话时模型无法还原的警告；`undefined` 表示正常 |

---

## 5. AgentSession 完整接口

### 5.1 只读属性（getter）

| 属性 | 类型 | 说明 |
|------|------|------|
| `agent` | `Agent` | 底层 agent 实例（来自 `@earendil-works/pi-agent-core`） |
| `sessionManager` | `SessionManager` | 会话管理器 |
| `settingsManager` | `SettingsManager` | 设置管理器 |
| `modelRuntime` | `ModelRuntime` | 模型运行时 |
| `resourceLoader` | `ResourceLoader` | 资源加载器 |
| `state` | `AgentState` | 完整 agent 状态（`messages`/`model`/`thinkingLevel`/`systemPrompt`/`tools`/`streamingMessage`/`errorMessage`） |
| `model` | `Model<any> \| undefined` | 当前模型 |
| `thinkingLevel` | `ThinkingLevel` | 当前思考等级 |
| `isStreaming` | `boolean` | 是否正在运行 |
| `isIdle` | `boolean` | 是否空闲 |
| `systemPrompt` | `string` | 当前生效系统提示词（含每轮扩展修改） |
| `messages` | `AgentMessage[]` | 全部消息（含自定义类型） |
| `isCompacting` | `boolean` | 是否正在压缩/分支摘要 |
| `isRetrying` | `boolean` | 是否正在自动重试 |
| `autoCompactionEnabled` | `boolean` | 自动压缩开关 |
| `autoRetryEnabled` | `boolean` | 自动重试开关 |
| `retryAttempt` | `number` | 当前重试次数 |
| `steeringMode` | `"all" \| "one-at-a-time"` | steering 队列模式 |
| `followUpMode` | `"all" \| "one-at-a-time"` | followUp 队列模式 |
| `sessionFile` | `string \| undefined` | 会话文件路径；内存会话为 `undefined` |
| `sessionId` | `string` | 会话 ID |
| `sessionName` | `string \| undefined` | 会话显示名 |
| `scopedModels` | `ReadonlyArray<{ model; thinkingLevel? }>` | 模型循环列表 |
| `promptTemplates` | `ReadonlyArray<PromptTemplate>` | 文件型 prompt 模板 |
| `pendingMessageCount` | `number` | 排队消息数量 |
| `isBashRunning` | `boolean` | 是否有 bash 正在执行 |
| `hasPendingBashMessages` | `boolean` | 是否有待落盘的 bash 消息 |
| `extensionRunner` | `ExtensionRunner` | 扩展运行时 |

### 5.2 发送与排队

#### `prompt(text, options?)`

```typescript
async prompt(text: string, options?: PromptOptions): Promise<void>
```

`PromptOptions`：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `expandPromptTemplates` | `boolean` | `true` | 是否处理扩展命令、skill 命令、prompt 模板 |
| `images` | `ImageContent[]` | 无 | 图片附件 |
| `streamingBehavior` | `"steer" \| "followUp"` | 无 | 流式中必须指定：`steer` 打断当前工具调用后插入；`followUp` 等本轮结束 |
| `source` | `InputSource` | `"interactive"` | 输入来源 |
| `preflightResult` | `(success: boolean) => void` | 无 | 预检回调：`true`=已接受/排队/处理，`false`=预检拒绝 |

行为要点：

- **流式中不带 `streamingBehavior` 会抛错**。
- 扩展命令（`/xxx`）立即执行，不进入 LLM 流。
- `prompt()` 在整轮完成后才 resolve（含重试）。

```typescript
await session.prompt("这是什么图片？", {
  images: [{ type: "image", source: { type: "base64", mediaType: "image/png", data: "..." } }],
});
```

#### `steer(text, images?, options?)`

```typescript
async steer(text: string, images?: ImageContent[], options?: { source?: InputSource }): Promise<void>
```

排队一条 steering 消息：当前助手回合执行完工具调用后、下一次 LLM 调用前投递。展开 skill/prompt 模板；对扩展命令抛错。

#### `followUp(text, images?, options?)`

```typescript
async followUp(text: string, images?: ImageContent[], options?: { source?: InputSource }): Promise<void>
```

排队一条 follow-up 消息：仅当 agent 没有更多工具调用或 steering 消息时才投递。

#### `sendUserMessage(content, options?)`

```typescript
async sendUserMessage(
  content: string | (TextContent | ImageContent)[],
  options?: { deliverAs?: "steer" | "followUp"; expandPromptTemplates?: boolean },
): Promise<void>
```

发送用户消息并触发一轮。`expandPromptTemplates` 默认 `false`（与 `prompt()` 相反）。

#### `sendCustomMessage(message, options?)`

```typescript
async sendCustomMessage<T = unknown>(
  message: Pick<CustomMessage<T>, "customType" | "content" | "display" | "details">,
  options?: { triggerTurn?: boolean; deliverAs?: "steer" | "followUp" | "nextTurn" },
): Promise<void>
```

写入自定义消息。常用于扩展/UI 注入特殊渲染内容。

#### 队列清理与查询

```typescript
clearQueue(): { steering: string[]; followUp: string[] }
getSteeringMessages(): readonly string[]
getFollowUpMessages(): readonly string[]
```

### 5.3 生命周期

```typescript
subscribe(listener: (event: AgentSessionEvent) => void): () => void  // 返回取消订阅函数
dispose(): void                                                        // 完全销毁，释放资源
abort(): Promise<void>                                                 // 中止当前操作并等待空闲
waitForIdle(): Promise<void>                                           // 等待空闲
reload(options?: { beforeSessionStart?: () => void | Promise<void> }): Promise<void>  // 重载设置/扩展/资源
bindExtensions(bindings: ExtensionBindings): Promise<void>             // 绑定扩展 UI/模式/错误处理
```

### 5.4 模型控制

```typescript
setModel(model: Model<any>, options?: { persist?: boolean }): Promise<void>
  // 切换模型。校验凭证。persist=true 才写全局默认。无凭证抛错。

cycleModel(direction?: "forward" | "backward", options?: { persist?: boolean }): Promise<ModelCycleResult | undefined>
  // 循环模型。优先 scopedModels，否则所有可用模型。只有一个模型时返回 undefined。
  // ModelCycleResult = { model, thinkingLevel, isScoped }

setThinkingLevel(level: ThinkingLevel, options?: { persist?: boolean }): void
cycleThinkingLevel(options?: { persist?: boolean }): ThinkingLevel | undefined
getAvailableThinkingLevels(): ThinkingLevel[]
supportsThinking(): boolean
setScopedModels(scopedModels: Array<{ model; thinkingLevel? }>): void
```

### 5.5 压缩 / 重试 / 队列模式

```typescript
compact(customInstructions?: string): Promise<CompactionResult>
  // 手动压缩上下文。CompactionResult = { summary, firstKeptEntryId, tokensBefore, estimatedTokensAfter, usage?, details? }

abortCompaction(): void
abortBranchSummary(): void
setAutoCompactionEnabled(enabled: boolean): void

abortRetry(): void
setAutoRetryEnabled(enabled: boolean): void

setSteeringMode(mode: "all" | "one-at-a-time"): void
setFollowUpMode(mode: "all" | "one-at-a-time"): void
```

### 5.6 Bash 执行

```typescript
async executeBash(
  command: string,
  onChunk?: (chunk: string) => void,
  options?: { excludeFromContext?: boolean; id?: string; operations?: BashOperations },
): Promise<BashResult>
  // BashResult = { output, exitCode, cancelled, truncated, fullOutputPath? }

recordBashResult(command: string, result: BashResult, options?: { excludeFromContext?: boolean }): void
abortBash(): void
```

### 5.7 会话树 / 分支 / 统计 / 导出

```typescript
setSessionName(name: string): void

async navigateTree(
  targetId: string,
  options?: { summarize?: boolean; customInstructions?: string; replaceInstructions?: boolean; label?: string },
): Promise<{ editorText?: string; cancelled: boolean; aborted?: boolean; summaryEntry?: BranchSummaryEntry }>

getUserMessagesForForking(): Array<{ entryId: string; text: string }>

getSessionStats(): SessionStats
  // { sessionFile, sessionId, userMessages, assistantMessages, toolCalls, toolResults, totalMessages,
  //   tokens:{input,output,cacheRead,cacheWrite,total}, cost, contextUsage? }

getContextUsage(): ContextUsage | undefined
  // { tokens, contextWindow, percent }

async exportToHtml(outputPath?: string, options?: { themeName?: string }): Promise<string>
exportToJsonl(outputPath?: string): string
getLastAssistantText(): string | undefined
```

### 5.8 工具查询 / 设置

```typescript
getActiveToolNames(): string[]
getAllTools(): ToolInfo[]                          // { name, description, parameters, promptGuidelines, sourceInfo }
getToolDefinition(name: string): ToolDefinition | undefined
setActiveToolsByName(toolNames: string[]): void    // 未知名称被忽略，下一轮生效
hasExtensionHandlers(eventType: string): boolean
createReplacedSessionContext(): ReplacedSessionContext
```

---

## 6. 模型与鉴权：ModelRuntime

### 6.1 创建

```typescript
static async create(options?: CreateModelRuntimeOptions): Promise<ModelRuntime>
```

`CreateModelRuntimeOptions`：

| 字段 | 类型 | 默认 | 说明 |
|------|------|------|------|
| `credentials` | `CredentialStore` | `authPath` 指向的文件 | 凭证存储。用 `InMemoryCredentialStore` 关闭落盘 |
| `authPath` | `string` | `~/.pi/agent/auth.json` | 凭证文件路径 |
| `modelsPath` | `string \| null` | `~/.pi/agent/models.json` | 自定义模型文件。`null` = 不读 |
| `modelsStore` | `ModelsStore` | 文件或内存 | 模型目录缓存存储 |
| `modelsStorePath` | `string` | `models.json` 同目录 | 目录缓存文件路径 |
| `allowModelNetwork` | `boolean` | `false` | 是否在 create 时联网刷新目录 |
| `modelRefreshTimeoutMs` | `number` | 无 | create 时联网刷新的超时 |
| `catalogBaseUrl` | `string` | 无 | 目录服务地址 |
| `signal` | `AbortSignal` | 无 | 取消初始恢复/可用性检查 |
| `refreshOnCreate` | `boolean` | `true` | 是否在 create 时做本地目录刷新 |

> 桌面端推荐的最小零配置写法：`credentials`（内存）+ `modelsPath: null`（目录缓存自动内存），然后用 `setRuntimeApiKey` 注入密钥。

### 6.2 模型查询

```typescript
getProviders(): readonly Provider[]
getProvider(providerId: string): Provider | undefined
getModels(providerId?: string): readonly Model<Api>[]          // 全部注册模型（不校验凭证）
getModel(providerId: string, modelId: string): Model<Api> | undefined
  // 返回 undefined 表示不存在。推荐用这个选模型（包含 models.json 自定义模型）。

async getAvailable(providerId?: string, options?: AuthOperationOptions): Promise<readonly Model<Api>[]>
  // 仅返回已配置有效凭证的模型

getAvailableSnapshot(): readonly Model<Api>[]                   // 同步快照（不触发刷新）
getError(): string | undefined                                  // 聚合错误信息
```

### 6.3 鉴权

```typescript
async checkAuth(providerId: string, options?: AuthOperationOptions): Promise<AuthCheck | undefined>
hasConfiguredAuth(providerId: string): boolean
isUsingOAuth(providerId: string): boolean
isUsingSubscription(providerId: string): boolean

async getAuth(providerId: string, overrides?: ModelRuntimeAuthOverrides): Promise<AuthResult | undefined>
async getAuth(model: Model<Api>, overrides?: ModelRuntimeAuthOverrides): Promise<AuthResult | undefined>

async setRuntimeApiKey(providerId: string, apiKey: string, options?: AuthOperationOptions): Promise<void>
  // 运行时注入 API Key，不落盘
async removeRuntimeApiKey(providerId: string, options?: AuthOperationOptions): Promise<void>

async listCredentials(options?: AuthOperationOptions): Promise<readonly CredentialInfo[]>
getProviderAuthStatus(providerId: string): AuthStatus
  // { configured: boolean; source: "runtime" | "stored" | "environment" | ... }

async login(providerId: string, type: AuthType, interaction: AuthInteraction): Promise<Credential>
async logout(providerId: string, options?: AuthOperationOptions): Promise<void>
```

鉴权优先级：**运行时 override > auth.json > 环境变量 > models.json 回退**。

### 6.4 底层模型调用（直接调用模型）

除了通过 `session.prompt()` 走 agent，也可以直接用 `ModelRuntime` 调用底层模型：

```typescript
// 流式
modelRuntime.streamSimple(model, context, options?): AssistantMessageEventStream
// 单次完整返回
modelRuntime.completeSimple(model, context, options?): Promise<AssistantMessage>

// 更底层的 provider API（与 pi-ai 类型一致）
modelRuntime.stream<TApi>(model, context, options?): AssistantMessageEventStream
modelRuntime.complete<TApi>(model, context, options?): Promise<AssistantMessage>
```

其中 `context` 形如：

```typescript
const context = {
  system: [{ type: "text", text: "You are helpful." }],
  messages: [{ role: "user", content: [{ type: "text", text: "你好" }] }],
};
```

> 桌面端一般不需要直接调用这些；`session.prompt()` 已封装了凭证解析、重试、压缩、事件流。

### 6.5 目录刷新

```typescript
async refresh(options?: ModelsRefreshOptions): Promise<ModelsRefreshResult>
  // { aborted: boolean; errors: Map<string, Error> }

registerProvider(providerId: string, config: ProviderConfigInput): void
registerNativeProvider(provider: Provider): void
unregisterProvider(providerId: string): void
```

---

## 7. 会话持久化：SessionManager

### 7.1 静态工厂

```typescript
static create(cwd: string, sessionDir?: string, options?: NewSessionOptions): SessionManager
  // 新建持久化会话。sessionDir 缺省用默认编码目录。

static open(path: string, sessionDir?: string, cwdOverride?: string): SessionManager
  // 打开指定 .jsonl 文件

static continueRecent(cwd: string, sessionDir?: string): SessionManager
  // 继续最近会话，无则新建

static inMemory(cwd: string = process.cwd(), options?: NewSessionOptions, entries?: FileEntry[]): SessionManager
  // 纯内存，不落盘。桌面端无持久化需求时用这个。
  // entries 可从数据库/外部存储恢复。

static forkFrom(sourcePath: string, targetCwd: string, sessionDir?: string, options?: NewSessionOptions): SessionManager

static async list(cwd: string, sessionDir?: string, onProgress?: SessionListProgress): Promise<SessionInfo[]>
static async listAll(sessionDirOrOnProgress?, onProgress?): Promise<SessionInfo[]>
```

### 7.2 实例查询

```typescript
getCwd(): string
getSessionDir(): string
getSessionId(): string
getSessionFile(): string | undefined       // 内存会话为 undefined
getSessionName(): string | undefined

getLeafId(): string | null
getLeafEntry(): SessionEntry | undefined
getEntry(id: string): SessionEntry | undefined
getChildren(parentId: string): SessionEntry[]
getLabel(id: string): string | undefined
getBranch(fromId?: string): SessionEntry[] // 从根到当前叶子的路径
buildSessionContext(): SessionContext
getHeader(): SessionHeader | null
getEntries(): SessionEntry[]               // 全部条目（不含 header）
getTree(): SessionTreeNode[]               // 完整树
```

### 7.3 写入 / 分支

```typescript
appendMessage(message: Message | CustomMessage | BashExecutionMessage): string
appendThinkingLevelChange(thinkingLevel: string): string
appendModelChange(provider: string, modelId: string): string
appendCompaction<T>(summary: string, firstKeptEntryId: string, tokensBefore: number, details?: T, fromExtension?: boolean, usage?: Usage): string
appendCustomEntry(customType: string, data?: unknown): string
appendSessionInfo(name: string): string
appendCustomMessageEntry<T>(customType, content, display?, details?): string
appendLabelChange(targetId: string, label: string | undefined): string

branch(branchFromId: string): void          // 叶子移动到更早条目
resetLeaf(): void
branchWithSummary(leafId: string | null, summary: string, details?, fromExtension?, usage?): string
createBranchedSession(leafId: string): string | undefined  // 提取路径到新文件
```

---

## 8. 设置：SettingsManager

### 8.1 静态工厂

```typescript
static create(cwd?: string, agentDir?: string): SettingsManager
  // 从文件加载：全局 ~/.pi/agent/settings.json + 项目 <cwd>/.pi/settings.json

static inMemory(settings?: Partial<Settings>, options?: SettingsManagerCreateOptions): SettingsManager
  // 纯内存，零文件 I/O

static fromStorage(storage: SettingsStorage, options?: SettingsManagerCreateOptions): SettingsManager
```

### 8.2 关键方法

```typescript
applyOverrides(overrides: Partial<Settings>): void   // 合并覆盖
async reload(): Promise<void>                        // 重新从存储加载
async flush(): Promise<void>                         // 等待持久化写入完成
drainErrors(): SettingsError[]                       // 取走并清空设置 I/O 错误
getGlobalSettings(): Settings
getProjectSettings(): Settings
isProjectTrusted(): boolean
setProjectTrusted(trusted: boolean): void
```

### 8.3 常用 getter / setter

模型与思考：

```typescript
getDefaultProvider(): string | undefined
getDefaultModel(): string | undefined
setDefaultProvider(provider: string): void
setDefaultModel(modelId: string): void
setDefaultModelAndProvider(provider: string, modelId: string): void
getDefaultThinkingLevel(): ThinkingLevel | undefined
setDefaultThinkingLevel(level: ThinkingLevel): void
getModelThinkingLevel(provider: string, modelId: string): ThinkingLevel | undefined
getAllModelThinkingLevels(): Record<string, ThinkingLevel>
setModelThinkingLevel(provider: string, modelId: string, level: ThinkingLevel): void
getEnabledModels(): string[]                       // 用于模型循环的 pattern
setEnabledModels(patterns: string[]): void
getDefaultTools(): string[] | undefined
```

压缩 / 重试 / 队列：

```typescript
getCompactionEnabled(): boolean
setCompactionEnabled(enabled: boolean): void
getCompactionReserveTokens(): number
getCompactionKeepRecentTokens(): number
getCompactionSettings(): { enabled; reserveTokens; keepRecentTokens }
getBranchSummarySettings(): { reserveTokens; skipPrompt }
getRetryEnabled(): boolean
setRetryEnabled(enabled: boolean): void
getRetrySettings(): { enabled; maxRetries; baseDelayMs; maxAgentDelayMs }
getSteeringMode(): "all" | "one-at-a-time"
setSteeringMode(mode): void
getFollowUpMode(): "all" | "one-at-a-time"
setFollowUpMode(mode): void
```

网络 / Shell / 其他：

```typescript
getHttpIdleTimeoutMs(): number
setHttpIdleTimeoutMs(timeoutMs: number): void
getWebSocketConnectTimeoutMs(): number | undefined
getProviderRetrySettings(): { timeoutMs?; maxRetries?; maxRetryDelayMs }
getShellPath(): string | undefined
setShellPath(path: string | undefined): void
getShellCommandPrefix(): string | undefined
setShellCommandPrefix(prefix: string | undefined): void
getTransport(): TransportSetting
setTransport(transport: TransportSetting): void
getTheme(): string | undefined
setTheme(theme: string): void
getSessionDir(): string | undefined
getExternalEditorCommand(): string
```

> `Settings` 完整字段见 `packages/coding-agent/src/core/settings-manager.ts` 的 `interface Settings`。

---

## 9. 资源加载：ResourceLoader

### 9.1 `ResourceLoader` 接口（完整）

```typescript
export interface ResourceLoader {
  getExtensions(): LoadExtensionsResult;
  getSkills(): { skills: Skill[]; diagnostics: ResourceDiagnostic[] };
  getPrompts(): { prompts: PromptTemplate[]; diagnostics: ResourceDiagnostic[] };
  getThemes(): { themes: Theme[]; diagnostics: ResourceDiagnostic[] };
  getAgentsFiles(): { agentsFiles: Array<{ path: string; content: string }> };
  getSystemPrompt(): string | undefined;
  getSystemPromptSource(): { path: string } | undefined;
  getAppendSystemPrompt(): string[];
  getAppendSystemPromptSources(): Array<{ path: string }>;
  extendResources(paths: ResourceExtensionPaths): void;
  reload(options?: ResourceLoaderReloadOptions): Promise<void>;
}
```

### 9.2 `DefaultResourceLoader` 构造选项

```typescript
new DefaultResourceLoader(options: DefaultResourceLoaderOptions)
```

| 字段 | 类型 | 说明 |
|------|------|------|
| `cwd` | `string`（必填） | 工作目录 |
| `agentDir` | `string`（必填） | 全局配置目录 |
| `settingsManager` | `SettingsManager` | 建议传内存实例，否则内部会 `SettingsManager.create` 读盘 |
| `eventBus` | `EventBus` | 扩展通信事件总线 |
| `additionalExtensionPaths` | `string[]` | 追加扩展路径 |
| `additionalSkillPaths` | `string[]` | 追加 skill 路径 |
| `additionalPromptTemplatePaths` | `string[]` | 追加 prompt 模板路径 |
| `additionalThemePaths` | `string[]` | 追加主题路径 |
| `extensionFactories` | `InlineExtension[]` | 内联扩展工厂 |
| `noExtensions` | `boolean` | 关闭扩展发现 |
| `noSkills` | `boolean` | 关闭 skill 发现 |
| `noPromptTemplates` | `boolean` | 关闭 prompt 模板发现 |
| `noThemes` | `boolean` | 关闭主题发现 |
| `noContextFiles` | `boolean` | 关闭 AGENTS.md 上下文 |
| `systemPrompt` | `string` | 直接指定系统提示词（跳过 SYSTEM.md 发现） |
| `appendSystemPrompt` | `string[]` | 直接指定追加提示词（跳过 APPEND_SYSTEM.md） |
| `extensionsOverride` | `(base) => LoadExtensionsResult` | 替换扩展加载结果 |
| `skillsOverride` | `(base) => { skills; diagnostics }` | 替换 skills |
| `promptsOverride` | `(base) => { prompts; diagnostics }` | 替换 prompt 模板 |
| `themesOverride` | `(base) => { themes; diagnostics }` | 替换主题 |
| `agentsFilesOverride` | `(base) => { agentsFiles }` | 替换上下文文件 |
| `systemPromptOverride` | `(base) => string \| undefined` | 改写系统提示词 |
| `appendSystemPromptOverride` | `(base: string[]) => string[]` | 改写追加提示词 |

调用 `await loader.reload()` 后才生效。查询方法：`getExtensions()` / `getSkills()` / `getPrompts()` / `getThemes()` / `getAgentsFiles()` / `getSystemPrompt()` / `getAppendSystemPrompt()`。

---

## 10. 事件流

```typescript
session.subscribe((event: AgentSessionEvent) => { ... });
```

### 10.1 流式文本 / 思考

```typescript
case "message_update":
  // event.assistantMessageEvent.type:
  //   "text_delta"       → event.assistantMessageEvent.delta
  //   "thinking_delta"   → event.assistantMessageEvent.delta
  //   "tool_call" | "tool_call_update" | "tool_result" | "usage"
```

### 10.2 消息生命周期

```typescript
"message_start"          // 新消息开始，event.message
"message_end"            // 消息完成，event.message
```

### 10.3 Agent / Turn 生命周期

```typescript
"agent_start"            // agent 开始
"agent_end"              // agent 结束，event.messages / event.willRetry
"agent_settled"          // 完全空闲
"turn_start"             // 一轮开始（一次 LLM 响应 + 工具调用）
"turn_end"               // 一轮结束，event.message / event.toolResults
```

### 10.4 工具执行

```typescript
"tool_execution_start"   // event.toolName / event.toolCallId / event.args
"tool_execution_update"  // event.partialResult
"tool_execution_end"     // event.result / event.isError
```

### 10.5 队列 / 压缩 / 重试 / 其他

```typescript
"queue_update"           // event.steering / event.followUp
"compaction_start"       // event.reason: "manual" | "threshold" | "overflow"
"compaction_end"         // event.result / event.aborted / event.willRetry
"entry_appended"         // event.entry
"session_info_changed"   // event.name
"thinking_level_changed" // event.level
"auto_retry_start"       // event.attempt / event.maxAttempts / event.delayMs / event.errorMessage
"auto_retry_end"         // event.success / event.attempt / event.finalError
"summarization_retry_scheduled"
"summarization_retry_attempt_start"   // event.source
"summarization_retry_finished"
"bash_execution_update"  // event.id / event.delta
```

> 完整事件类型见 `packages/coding-agent/src/core/agent-session.ts` 的 `AgentSessionEvent`。

---

## 11. 工具与自定义工具

### 11.1 内置工具名

`read`、`bash`、`powershell`、`edit`、`write`、`grep`、`find`、`ls`

默认启用：`read`、`bash`、`edit`、`write`。

```typescript
// 只读
const { session } = await createAgentSession({ tools: ["read", "grep", "find", "ls"] });

// 禁用单个工具
const { session } = await createAgentSession({ excludeTools: ["ask_question"] });
```

### 11.2 自定义工具 `defineTool`

```typescript
import { Type } from "typebox";
import { createAgentSession, defineTool } from "@earendil-works/pi-coding-agent";

const myTool = defineTool({
  name: "my_tool",
  label: "My Tool",
  description: "Does something useful",
  parameters: Type.Object({
    input: Type.String({ description: "Input value" }),
  }),
  execute: async (_toolCallId, params) => ({
    content: [{ type: "text", text: `Result: ${params.input}` }],
    details: {},
  }),
});

const { session } = await createAgentSession({
  customTools: [myTool],
  tools: ["read", "bash", "my_tool"],   // 白名单里要包含自定义工具名
});
```

`ToolDefinition.execute` 返回：

```typescript
{
  content: Array<{ type: "text"; text: string } | { type: "image"; ... }>;
  details: Record<string, unknown>;
  isError?: boolean;
  usage?: Usage;
}
```

---

## 12. 扩展 / Skills / 上下文文件 / Prompt 模板

### 12.1 内联扩展

```typescript
import { createAgentSession, DefaultResourceLoader } from "@earendil-works/pi-coding-agent";

const loader = new DefaultResourceLoader({
  cwd: process.cwd(),
  agentDir: "/my/app/agent",
  noExtensions: true,     // 关掉磁盘扩展发现，只保留内联
  extensionFactories: [
    (pi) => {
      pi.on("agent_start", () => console.log("started"));
      pi.on("tool_call", async (event) => {
        // return { block: true, reason: "..." } 可阻断工具
        return undefined;
      });
      pi.registerTool({ name: "my_tool", /* ... */ });
      pi.registerCommand("mycommand", { description, handler });
    },
  ],
});
await loader.reload();
```

### 12.2 Skills

```typescript
const customSkill: Skill = {
  name: "my-skill",
  description: "Custom instructions",
  filePath: "/virtual/SKILL.md",
  baseDir: "/virtual",
  sourceInfo: createSyntheticSourceInfo("/virtual/SKILL.md", { source: "sdk" }),
  disableModelInvocation: false,
};

const loader = new DefaultResourceLoader({
  cwd, agentDir,
  noSkills: true,
  skillsOverride: (current) => ({
    skills: [...current.skills, customSkill],
    diagnostics: current.diagnostics,
  }),
});
```

### 12.3 上下文文件（AGENTS.md）

```typescript
const loader = new DefaultResourceLoader({
  cwd, agentDir,
  noContextFiles: true,
  agentsFilesOverride: (current) => ({
    agentsFiles: [
      ...current.agentsFiles,
      { path: "/virtual/AGENTS.md", content: "# Guidelines\n\n- Be concise" },
    ],
  }),
});
```

### 12.4 Prompt 模板（斜杠命令）

```typescript
const deployTemplate: PromptTemplate = {
  name: "deploy",
  description: "Deploy the application",
  filePath: "/virtual/prompts/deploy.md",
  sourceInfo: createSyntheticSourceInfo("/virtual/prompts/deploy.md", { source: "sdk" }),
  content: "# Deploy\n\n1. Build\n2. Test\n3. Deploy",
};

const loader = new DefaultResourceLoader({
  cwd, agentDir,
  noPromptTemplates: true,
  promptsOverride: (current) => ({
    prompts: [...current.prompts, deployTemplate],
    diagnostics: current.diagnostics,
  }),
});
```

---

## 13. 会话运行时：AgentSessionRuntime

当需要**替换当前会话**（new / fork / switch / import）时使用。这也是内置交互、print、RPC 模式共用的层。

```typescript
import {
  type CreateAgentSessionRuntimeFactory,
  createAgentSessionFromServices,
  createAgentSessionRuntime,
  createAgentSessionServices,
  getAgentDir,
  SessionManager,
} from "@earendil-works/pi-coding-agent";

const createRuntime: CreateAgentSessionRuntimeFactory = async ({ cwd, sessionManager, sessionStartEvent }) => {
  const services = await createAgentSessionServices({ cwd });
  return {
    ...(await createAgentSessionFromServices({ services, sessionManager, sessionStartEvent })),
    services,
    diagnostics: services.diagnostics,
  };
};

const runtime = await createAgentSessionRuntime(createRuntime, {
  cwd: process.cwd(),
  agentDir: getAgentDir(),
  sessionManager: SessionManager.inMemory(process.cwd()),
});
```

### 13.1 `AgentSessionRuntime` 属性

| 属性 | 类型 | 说明 |
|------|------|------|
| `session` | `AgentSession` | 当前会话（替换后变化） |
| `services` | `AgentSessionServices` | cwd 绑定服务 |
| `cwd` | `string` | 当前 cwd |
| `diagnostics` | `readonly AgentSessionRuntimeDiagnostic[]` | 启动诊断 |
| `modelFallbackMessage` | `string \| undefined` | 模型还原警告 |

### 13.2 方法

```typescript
async newSession(options?: { parentSession?; setup?; withSession? }): Promise<{ cancelled: boolean }>
async switchSession(sessionPath: string, options?: { cwdOverride?; withSession?; projectTrustContextFactory? }): Promise<{ cancelled: boolean }>
async fork(entryId: string, options?: { position?: "before" | "at"; withSession? }): Promise<{ cancelled: boolean; selectedText?: string }>
async importFromJsonl(inputPath: string, cwdOverride?: string): Promise<{ cancelled: boolean }>
async dispose(): Promise<void>

setRebindSession(rebindSession?: (session: AgentSession) => Promise<void>): void
setBeforeSessionInvalidate(callback?: () => void): void
```

> **关键行为**：`runtime.session` 在 new/fork/switch/import 后会变化；事件订阅绑定在具体 `AgentSession` 上，替换后必须重新 `runtime.session.subscribe(...)`；若使用扩展，替换后也要重新 `session.bindExtensions(...)`。

---

## 14. 完整桌面端集成示例

```typescript
import { InMemoryCredentialStore } from "@earendil-works/pi-ai";
import {
  createAgentSession,
  DefaultResourceLoader,
  ModelRuntime,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";

async function createDesktopSession(opts: {
  cwd: string;
  provider: string;
  apiKey: string;
  modelId?: string;
  thinkingLevel?: "off" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max";
}) {
  // ── 1. 模型运行时：内存凭证，不读 auth.json / models.json ──
  const modelRuntime = await ModelRuntime.create({
    credentials: new InMemoryCredentialStore(),
    modelsPath: null,
  });
  await modelRuntime.setRuntimeApiKey(opts.provider, opts.apiKey);

  // ── 2. 选模型（可选；不传则由可用模型推导） ──
  let model;
  if (opts.modelId) {
    model = modelRuntime.getModel(opts.provider, opts.modelId);
    if (!model) throw new Error(`Model not found: ${opts.provider}/${opts.modelId}`);
  }

  // ── 3. 设置：纯内存，不读 settings.json ──
  const settingsManager = SettingsManager.inMemory({
    compaction: { enabled: false },
    retry: { enabled: true, maxRetries: 2 },
  });

  // ── 4. 资源：关闭所有磁盘发现 ──
  const loader = new DefaultResourceLoader({
    cwd: opts.cwd,
    agentDir: "/my/app/agent",
    settingsManager,
    noExtensions: true,
    noSkills: true,
    noPromptTemplates: true,
    noThemes: true,
    noContextFiles: true,
    systemPrompt: "You are a helpful assistant.",
    appendSystemPrompt: [],
  });
  await loader.reload();

  // ── 5. 会话：内存，不落盘 ──
  const { session } = await createAgentSession({
    cwd: opts.cwd,
    agentDir: "/my/app/agent",
    modelRuntime,
    model,
    thinkingLevel: opts.thinkingLevel,
    settingsManager,
    resourceLoader: loader,
    sessionManager: SessionManager.inMemory(opts.cwd),
  });

  // ── 6. 订阅事件（桌面端把 delta 转发到 UI） ──
  const unsubscribe = session.subscribe((event) => {
    switch (event.type) {
      case "message_update":
        if (event.assistantMessageEvent.type === "text_delta") {
          ui.appendText(event.assistantMessageEvent.delta);
        }
        break;
      case "tool_execution_start":
        ui.showTool(event.toolName);
        break;
      case "agent_settled":
        ui.done();
        break;
    }
  });

  return { session, modelRuntime, unsubscribe };
}

// ── 使用 ──
const { session, unsubscribe } = await createDesktopSession({
  cwd: "/path/to/project",
  provider: "anthropic",
  apiKey: process.env.MY_KEY!,
  modelId: "claude-opus-4-5",
  thinkingLevel: "medium",
});

await session.prompt("帮我重构这个文件");
unsubscribe();
session.dispose();
```

---

## 附：常用导出速查

```typescript
// 工厂
createAgentSession / createAgentSessionRuntime / AgentSessionRuntime

// 模型与鉴权
ModelRuntime / CredentialSynchronizationError / resolveCliModel / resolveModelScopeWithDiagnostics

// 资源
DefaultResourceLoader / type ResourceLoader / createEventBus

// 会话与设置
SessionManager / SettingsManager

// 工具
defineTool / createCodingTools / createReadOnlyTools
createReadTool / createBashTool / createPowerShellTool / createEditTool / createWriteTool
createGrepTool / createFindTool / createLsTool

// 类型
type CreateAgentSessionOptions / type CreateAgentSessionResult
type AgentSession / type AgentSessionEvent / type PromptOptions
type ExtensionFactory / type InlineExtension / type ExtensionAPI
type ToolDefinition / type Skill / type PromptTemplate / type Tool
```
