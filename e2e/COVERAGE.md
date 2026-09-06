# e2e 覆盖对照（相对协议线）

脚本：
- 协议线套件：`pnpm test`（`test/run.ts` → contract / outbound / inbound；fake model，无 DeepSeek）
- UI 游程：`e2e/deepseek-tour.mjs`（`pnpm test:ui`）。遇错即停。

图例：`✅` 有硬检查 · `⚠️` 依赖模型/时机 · `➖` 故意不测（破坏性/壳）

## 去程（26）

| 协议 | `pnpm test` | UI e2e | 段落 |
|---|---|---|---|
| `session:open` | ✅ | ✅ | D / H / 恢复 |
| `session:close` | ✅ | ✅ | G 删前关闭、H 关闭 |
| `session:getState` | ✅ | ✅ | F 后状态页（steer 路径也会拉） |
| `session:prompt` | ✅ | ✅ | D 多轮；I 含图片 |
| `session:continue` | ✅ | ✅ | H 点击继续并 waitIdle |
| `session:steer` | ✅ | ✅ | F |
| `session:followUp` | ✅ | ✅ | F |
| `session:clearQueue` | ✅ | ✅ | F：followUp / steering / all 各一次 |
| `session:abort` | ✅ | ✅ | F |
| `session:requestStop` | ✅ | ✅ | F：停止 + cancel |
| `session:reset` | ✅ | ✅ | H 清空对话 |
| `session:setMessages` | ✅ | ✅ | H |
| `session:truncate` | ✅ | ✅ | H 回退 |
| `session:compact` | ✅ | ✅ | H + compacted 文案 |
| `session:configure` | ✅ | ✅ | B / apply |
| `session:runSkill` | ✅ | ✅ | G/J：断言 `greet` 后 Run |
| `session:runTemplate` | ✅ | ✅ | G/J：断言 `summarize` 后 Run |
| `session:reloadResources` | ✅ | ✅ | C/G/J |
| `workspace:browse` | ✅ | ✅ | C |
| `workspace:validate` | ✅ | ✅ | C |
| `workspace:switch` | ✅ | ✅ | C |
| `workspace:recent` | ✅ | ✅ | C |
| `tool:approve` | ✅ | ✅ | E 四分支 |
| `sessions:list` | ✅ | ✅ | G |
| `sessions:delete` | ✅ | ✅ | G 真删 |
| `model:inspect` | ✅ | ✅ | B |

## 回程（16）

| 协议 | `pnpm test` | UI e2e | 段落 |
|---|---|---|---|
| `ready` | ✅ | ✅ | A / J「已连接」 |
| `agent:event` | ✅ | ✅ | G/J 事件页 |
| `session:state` | ✅ | ✅ | F 状态快照 |
| `session:runEnd` | ✅ | ✅ | waitIdle 隐含各回合 |
| `session:closed` | ✅ | ✅ | H 关会话后「开始会话」 |
| `session:resources` | ✅ | ✅ | 资源 tab / reload |
| `session:workspace` | ✅ | ✅ | C 切换 |
| `session:compacted` | ✅ | ✅ | H 压缩文案 |
| `session:turnPrepared` | ✅ | ✅ | I 运行中改系统提示 |
| `session:stopRequested` | ✅ | ✅ | F 状态徽章 |
| `tool:approvalRequest` | ✅ | ✅ | E |
| `tool:approvalResolved` | ✅ | ✅ | E 点过后继续 |
| `tool:resultAdjusted` | ✅ | ✅ | D 大文件截断文案 |
| `debug:payload` / `debug:response` | ✅ | ✅ | B 开记录 + J 请求页 |
| `log` | ✅ | ✅ | C workspace switched / I 图片 drop |

## 壳 / 环境

| 项 | 覆盖 |
|---|---|
| 面板、主题、语言 | ✅ A |
| 断线「立即重连」 | ✅ I（`window.__pine` DEV） |
| 图片附件 | ✅ I |
| 协议版本不匹配 | ✅ J（`window.__pineStore` 注入，不破坏真实契约） |
| Tauri 壳 | ➖ Vite；`build:tauri` 另测 |

## 说明

- skill / template：工作区 `.pine/skills|commands` 由 runtime 默认目录发现；不再在 B 段写空 `skillDirs`（空串会盖掉默认路径）。
- 协议正确性优先看 `pnpm test`（`test/` 线套件）；`pnpm test:ui` 验证控件与真实 DeepSeek 路径。
