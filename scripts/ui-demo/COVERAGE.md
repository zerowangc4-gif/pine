# Pine UI 功能覆盖清单

对照 `apps/desktop` 真实控件与 `deepseek-tour.mjs`。

图例：`✅` 演示覆盖 · `⚠️` 部分 · `❌` 环境限制

## 协议 → UI

| 事件 / 能力 | UI |
| --- | --- |
| session:open / close / reset / continue / truncate / setMessages | ✅ |
| prompt / steer / followUp / abort / stop | ✅ Composer |
| clearQueue（插话 / 后续 / 全部） | ✅ 状态页 |
| 审批（允许 / 始终允许 / 拒绝） | ✅ 审批条（按工具申请） |
| 工具启用 read/write/edit/bash/finish | ✅ 配置 → 工具 |
| 始终允许 read/write/edit/bash（不含 finish） | ✅ 配置 → 审批 |
| workspace / sessions / model:inspect / compact | ✅ |

## 环境未测

| Tauri 壳 | ❌ Vite |
| 协议版本不匹配 | ❌ 需人为制造 |
