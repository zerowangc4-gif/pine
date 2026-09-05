# Pine 协议线（文件流转）

每条线写清 **从哪个文件到哪个文件**。终点写到 `packages/agent/src/agent.ts` 公开 API（或不触及 agent）。不展开 agent-loop。

## 总览

### 去程骨架

```
apps/desktop/src/store/actions/{session,workspace,library}.ts
  → apps/desktop/src/socket/send.ts
  → packages/socket-client/src/send.ts
  → packages/protocol/src/client-to-server.ts
  → packages/socket-server/src/send.ts
  → packages/runtime/src/socket/send.ts
  → packages/runtime/src/session/{hub,session}.ts
  → packages/agent/src/agent.ts   （或 domain/*，不进 agent）
```

### 回程骨架

```
packages/runtime/src/session/session.ts  （或 hub / socket/subscribe）
  → packages/socket-server/src/subscribe.ts
  → packages/protocol/src/server-to-client.ts
  → packages/socket-client/src/subscribe.ts
  → apps/desktop/src/socket/subscribe.ts
  → apps/desktop/src/store/slices/*
```

契约对照：两边同名 `send.ts` / `subscribe.ts`，方法名 1:1。

---

## 去程（client → server → agent）

### `session:open` · `send.openSession`

```
actions/session.ts
  → desktop/socket/send.ts
  → socket-client/send.ts openSession
  → protocol/client-to-server.ts  session:open
  → socket-server/send.ts openSession
  → runtime/socket/send.ts
  → runtime/session/hub.ts open
  → runtime/session/session.ts  （构造 Agent + agent.subscribe）
  → agent.ts  构造；不 prompt
```

### `session:close` · `send.closeSession`

```
actions/session.ts
  → …send… session:close
  → runtime/socket/send.ts
  → runtime/session/hub.ts close
  → runtime/session/session.ts close
  → agent.ts abort
```

回程：`session:closed`（见下）。

### `session:getState` · `send.getSessionState`

```
actions/session.ts（steer/followUp 后也会拉）
  → …send… session:getState
  → runtime/session/session.ts snapshot
  → 读 agent.state；不启动 run
```

无推送（ack 即快照）。

### `session:prompt` · `send.prompt`

```
actions/session.ts
  → …send… session:prompt
  → runtime/session/session.ts prompt
  → agent.ts prompt
```

典型回程：`agent:event`* → `session:state` → `session:runEnd`。

### `session:continue` · `send.continueRun`

```
actions/session.ts → … → session.ts continueRun → agent.ts continue
```

### `session:steer` · `send.steer`

```
actions/session.ts → … → session.ts steer → agent.ts steer
```

### `session:followUp` · `send.followUp`

```
actions/session.ts → … → session.ts followUp → agent.ts followUp
```

### `session:clearQueue` · `send.clearQueue`

```
actions/session.ts → … → session.ts clearQueue
  → agent.ts clearSteeringQueue | clearFollowUpQueue | clearAllQueues
```

回程：常 `session:state`。

### `session:abort` · `send.abort`

```
actions/session.ts → … → session.ts abort → agent.ts abort
```

回程：`session:runEnd`、`session:state`。

### `session:requestStop` · `send.requestStop`

```
actions/session.ts → … → session.ts requestStop
  → 不直接 agent.abort；turn 边界停
```

回程：`session:stopRequested`（desktop subscribe 当前未接 UI）。

### `session:reset` · `send.reset`

```
actions/session.ts → … → session.ts reset → agent.ts reset
```

### `session:setMessages` · `send.setMessages`

```
actions/session.ts → … → session.ts setMessages → 写 agent.state.messages
```

### `session:truncate` · `send.truncate`

```
actions/session.ts → … → session.ts truncate → 截断 agent.state.messages
```

### `session:compact` · `send.compact`

```
actions/session.ts → … → session.ts compactNow
  → domain/compaction.ts（读 agent.state；不 prompt）
```

回程：可能 `session:compacted`、`session:state`。

### `session:configure` · `send.configure`

```
actions/session.ts → … → session.ts configure → 改 agent.state / modes
```

回程：`session:state`；defer → `session:turnPrepared`；资源目录 → `session:resources`。

### `session:runSkill` · `send.runSkill`

```
actions/session.ts → … → session.ts runSkill → agent.ts prompt
```

### `session:runTemplate` · `send.runTemplate`

```
actions/session.ts → … → session.ts runTemplate → agent.ts prompt
```

### `session:reloadResources` · `send.reloadResources`

```
actions/session.ts → … → session.ts reloadResources → 写 agent.state.systemPrompt；不 prompt
```

### `workspace:browse` · `send.browseWorkspace`

```
actions/workspace.ts
  → …send… workspace:browse
  → runtime/socket/send.ts
  → domain/workspace.ts browseDirectory
  → 不触及 agent
```

### `workspace:validate` · `send.validateWorkspace`

```
actions/workspace.ts → … → domain/workspace.ts validateWorkspace → 不触及 agent
```

### `workspace:switch` · `send.switchWorkspace`

```
actions/workspace.ts → … → session.ts switchWorkspace
  → 更新 agent.state.tools / systemPrompt；不新开 prompt
```

回程：`session:workspace`、`session:resources`、`session:state`、`log`。

### `workspace:recent` · `send.recentWorkspaces`

```
actions/workspace.ts → … → domain/persistence.ts recentWorkspaces → 不触及 agent
```

### `tool:approve` · `send.approveTool`

```
actions/session.ts → … → session.ts resolveApproval
  → 解开挂起 Promise（不新调 agent API；同一 run 继续）
```

回程：`tool:approvalResolved`、`session:state`；可能继续 `agent:event`。

### `sessions:list` · `send.listSessions`

```
actions/library.ts → … → domain/persistence.ts list → 不触及 agent
```

### `sessions:delete` · `send.deleteSession`

```
actions/library.ts → … → hub.close（同 session:close → agent.abort）→ persistence 删盘
```

### `model:inspect` · `send.inspectModel`

```
actions/library.ts → … → domain/model.ts createModelRuntime → 不触及 agent
```

---

## 回程（session → UI）

路径缩写：`session.ts` = `packages/runtime/src/session/session.ts`；desktop 终点为 `apps/desktop/src/socket/subscribe.ts` → 下列 slice。

### `ready` · `subscribe.ready` → `onReady`

```
runtime/socket/subscribe.ts attachSubscribe
  → socket-server/subscribe.ts ready
  → protocol/server-to-client.ts ready
  → socket-client/subscribe.ts onReady
  → desktop/socket/subscribe.ts
  → store/slices/connection.ts
```

### `agent:event` · `subscribe.agentEvent` → `onAgentEvent`

```
agent.ts subscribe 回调
  → session.ts
  → socket-server/subscribe.ts agentEvent
  → … → desktop/socket/subscribe.ts
  → store/slices/transcript.ts + debug.ts
```

### `session:state` · `subscribe.sessionState` → `onSessionState`

```
session.ts publishState
  → … → desktop/socket/subscribe.ts
  → store/slices/session.ts + approvals.ts + config.ts
```

### `session:runEnd` · `subscribe.sessionRunEnd` → `onSessionRunEnd`

```
session.ts startRun finally
  → … → session.ts runEnded + transcript notices
```

### `session:closed` · `subscribe.sessionClosed` → `onSessionClosed`

```
session/hub.ts close
  → … → session.ts closed + transcript clear + approvals clear
```

### `session:resources` · `subscribe.sessionResources` → `onSessionResources`

```
session.ts（configure / switchWorkspace / 重载路径）
  → … → store/slices/session.ts resourcesReceived
```

### `session:workspace` · `subscribe.sessionWorkspace` → `onSessionWorkspace`

```
session.ts switchWorkspace
  → … → transcript notice
```

### `session:compacted` · `subscribe.sessionCompacted` → `onSessionCompacted`

```
session.ts（compact 成功）
  → … → transcript compacted
```

### `session:turnPrepared` · `subscribe.sessionTurnPrepared` → `onSessionTurnPrepared`

```
session.ts（deferred 配置生效）
  → … → transcript turnPrepared
```

### `session:stopRequested` · `subscribe.sessionStopRequested` → `onSessionStopRequested`

```
session.ts requestStop / setStopReason
  → socket-server/subscribe.ts …
  → socket-client onSessionStopRequested
  → desktop subscribe：契约有，UI 未单独接线
```

### `tool:approvalRequest` · `onToolApprovalRequest`

```
session.ts（工具前挂起）
  → … → store/slices/approvals.ts → components/approvals/ApprovalBar.tsx
```

### `tool:approvalResolved` · `onToolApprovalResolved`

```
session.ts resolveApproval
  → … → approvals.ts resolved
```

### `tool:resultAdjusted` · `onToolResultAdjusted`

```
session.ts afterToolCall 截断
  → … → transcript notice
```

### `debug:payload` / `debug:response`

```
session.ts（debugPayloads 开时 onPayload / onResponse）
  → … → store/slices/debug.ts
```

### `log` · `onLog`

```
session.ts log
  → … → transcript notice
```

---

## 勾选清单

去程每条：协议名 ↔ 两边 `send.ts` 方法 ↔ desktop/runtime 接线 ↔ 最终反应（agent 或 domain）。  
回程每条：协议名 ↔ `subscribe.*` / `on*` ↔ 发出文件 ↔ desktop slice。
