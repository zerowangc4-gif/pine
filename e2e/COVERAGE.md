# e2e 覆盖对照（相对协议线）

脚本：`e2e/deepseek-tour.mjs`（`pnpm test:ui`）。遇错即停。

图例：`✅` 脚本有硬检查 · `⚠️` 依赖模型/时机 · `➖` 故意不测（破坏性/壳）

## 去程（26）

| 协议 | 覆盖 | 段落 |
|---|---|---|
| `session:open` | ✅ | D / H / 恢复 |
| `session:close` | ✅ | G 删前关闭、H 关闭 |
| `session:getState` | ✅ | F 后状态页（steer 路径也会拉） |
| `session:prompt` | ✅ | D 多轮；I 含图片 |
| `session:continue` | ✅ | H 点击继续并 waitIdle |
| `session:steer` | ✅ | F |
| `session:followUp` | ✅ | F |
| `session:clearQueue` | ✅ | F：followUp / steering / all 各一次 |
| `session:abort` | ✅ | F |
| `session:requestStop` | ✅ | F：停止 + cancel |
| `session:reset` | ✅ | H 清空对话 |
| `session:setMessages` | ✅ | H |
| `session:truncate` | ✅ | H 回退 |
| `session:compact` | ✅ | H + compacted 文案 |
| `session:configure` | ✅ | B / apply |
| `session:runSkill` | ⚠️ | G/J 依赖资源目录 |
| `session:runTemplate` | ⚠️ | G/J |
| `session:reloadResources` | ✅ | C/G/J |
| `workspace:browse` | ✅ | C |
| `workspace:validate` | ✅ | C |
| `workspace:switch` | ✅ | C |
| `workspace:recent` | ✅ | C |
| `tool:approve` | ✅ | E 四分支 |
| `sessions:list` | ✅ | G |
| `sessions:delete` | ✅ | G 真删 |
| `model:inspect` | ✅ | B |

## 回程（16）

| 协议 | 覆盖 | 段落 |
|---|---|---|
| `ready` | ✅ | A / J「已连接」 |
| `agent:event` | ✅ | G/J 事件页 |
| `session:state` | ✅ | F 状态快照 |
| `session:runEnd` | ✅ | waitIdle 隐含各回合 |
| `session:closed` | ✅ | H 关会话后「开始会话」 |
| `session:resources` | ✅ | 资源 tab / reload |
| `session:workspace` | ✅ | C 切换 |
| `session:compacted` | ✅ | H 压缩文案 |
| `session:turnPrepared` | ✅ | I 运行中改系统提示 |
| `session:stopRequested` | ✅ | F 状态徽章 |
| `tool:approvalRequest` | ✅ | E |
| `tool:approvalResolved` | ✅ | E 点过后继续 |
| `tool:resultAdjusted` | ✅ | D 大文件截断文案 |
| `debug:payload` / `debug:response` | ✅ | B 开记录 + J 请求页 |
| `log` | ✅ | C workspace switched / I 图片 drop |

## 壳 / 环境

| 项 | 覆盖 |
|---|---|
| 面板、主题、语言 | ✅ A |
| 断线「立即重连」 | ✅ I（`window.__pine` DEV） |
| 图片附件 | ✅ I |
| Tauri 壳 | ➖ Vite |
| 协议版本不匹配 | ➖ 不破坏契约 |

## 说明

`runSkill` / `runTemplate` 仍标 ⚠️：依赖配置里技能/模板目录与模型配合；失败会 `check false` 停测，需保证 B 段目录写入成功。
