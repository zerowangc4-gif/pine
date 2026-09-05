# e2e 覆盖对照（相对协议线）

依据：`e2e/deepseek-tour.mjs` 实际点击路径 vs `test.md` / `client-to-server` / `server-to-client`。

图例：`✅` 脚本明确走到 · `⚠️` 间接/部分 · `❌` 未测

## 去程（26）

| 协议 | 覆盖 | 说明 |
|---|---|---|
| `session:open` | ✅ | 开始/新建会话、恢复会话 |
| `session:close` | ✅ | 关闭会话 |
| `session:getState` | ⚠️ | 无单独 UI；steer 后 actions 会拉，未断言 |
| `session:prompt` | ✅ | 多轮发送 / Enter |
| `session:continue` | ⚠️ | 只断言「继续」按钮可见，**未点击** |
| `session:steer` | ⚠️ | 有插话分支；按钮未出现时 note 跳过 |
| `session:followUp` | ✅ | 排入后续 |
| `session:clearQueue` | ⚠️ | 只清 **一种**（后续 / 插话 / 全部 三选一），非三种全走 |
| `session:abort` | ⚠️ | 运行中才点；空闲则跳过 |
| `session:requestStop` | ✅ | 本轮结束后停止 + 取消停止 |
| `session:reset` | ✅ | 清空对话 |
| `session:setMessages` | ✅ | 状态页 JSON 清空/写入 |
| `session:truncate` | ✅ | 回退到这里 |
| `session:compact` | ✅ | 立即压缩（未强断言 compacted 文案） |
| `session:configure` | ✅ | 配置面板应用 / 还原 |
| `session:runSkill` | ⚠️ | 有 Run 才测；失败则 check false |
| `session:runTemplate` | ⚠️ | 同上，需第二个 Run |
| `session:reloadResources` | ✅ | 资源页重新加载 |
| `workspace:browse` | ✅ | 选择器导航 / 隐藏目录 |
| `workspace:validate` | ✅ | 非法路径反馈 |
| `workspace:switch` | ✅ | 使用此目录 |
| `workspace:recent` | ⚠️ | 只看「最近使用」区存在，弱断言 |
| `tool:approve` | ✅ | 允许一次 / 始终允许 / 拒绝 / 拒绝并停止 |
| `sessions:list` | ✅ | 会话库范围 + 刷新 |
| `sessions:delete` | ❌ | **只断言删除按钮存在，未点击删除** |
| `model:inspect` | ✅ | 测试模型 |

## 回程（16）— 多为副作用，脚本很少直接断言事件名

| 协议 | 覆盖 | 说明 |
|---|---|---|
| `ready` | ⚠️ | 「已连接」隐含 |
| `agent:event` | ⚠️ | 检查器「事件」页有 tool_/agent_ 文案则过 |
| `session:state` | ⚠️ | UI 状态变化隐含，无专项断言 |
| `session:runEnd` | ⚠️ | waitIdle / 回合结束隐含 |
| `session:closed` | ⚠️ | 关会话后回到「开始会话」 |
| `session:resources` | ⚠️ | 资源 tab / reload 隐含 |
| `session:workspace` | ⚠️ | switch 后隐含 |
| `session:compacted` | ❌ | 点了压缩，**未断言** compacted notice |
| `session:turnPrepared` | ❌ | 未测 deferred 配置边界 |
| `session:stopRequested` | ❌ | desktop subscribe 也未接 UI；未断言 |
| `tool:approvalRequest` | ✅ | 等审批条 |
| `tool:approvalResolved` | ⚠️ | 点审批后继续，未单独断言 |
| `tool:resultAdjusted` | ⚠️ | 大文件 read + 低字节上限，未断言截断文案 |
| `debug:payload` / `debug:response` | ⚠️ | 开了记录请求；请求页只 check 打开 |
| `log` | ❌ | 未专项断言 |

## UI / 环境（非协议）

| 项 | 覆盖 |
|---|---|
| 配置/检查器面板、主题、语言 | ✅ |
| 工具 read/write/edit/bash、多步、只读策略、黑名单 | ✅ / ⚠️ |
| 图片附件 prompt | ❌ |
| 预组 `messages` 的 prompt（非 setMessages） | ❌ |
| Tauri 壳 | ❌ Vite |
| 协议版本不匹配 | ❌ |
| 断线「立即重连」 | ❌ 只 note |

## 结论

**不能**覆盖「每种情况」。

- 去程：约一半是硬走通；`continue` 未点、`sessions:delete` 未删、队列清空只测一支、skill/template/steer/abort 依赖时机。
- 回程：几乎不按事件验收，只靠 UI 副作用；`turnPrepared` / `stopRequested` / `log` / `compacted` 断言基本空缺。
- `COVERAGE.md` 旧表把 open/close/reset/… 整行标 ✅ 偏乐观，以本表为准。

若要补齐，优先：点「继续」、真删会话、三队列各清一次、压缩/截断 notice 断言、skill+template 固定资源、可选图片附件。
