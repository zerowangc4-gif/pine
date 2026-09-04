# Pine

Local coding agent desktop app (Tauri + React) with an embedded Node sidecar. The UI never mutates `@pine/agent` or `@pine/ai`; a thin runtime glue layer wraps 100% of the `Agent` surface and exposes it over Socket.IO.

## Architecture

```
apps/desktop          React UI (Redux Toolkit + styled-components + i18n)
        │ Socket.IO (typed events in @pine/protocol)
        ▼
packages/runtime      glue: sessions, tools, workspace, persistence, handlers
        │ imports only
        ▼
packages/agent        Agent loop (DO NOT MODIFY)
packages/ai           providers / models (DO NOT MODIFY)
packages/protocol     dependency-free wire types shared by UI and runtime
```

### Strict asset protection

- Do not edit files under `packages/agent` or `packages/ai`.
- Wire types live in `@pine/protocol` as structural copies so the browser bundle never pulls Node/agent deps.
- `packages/runtime/src/conformance.ts` is compile-time proof that protocol types still assign to library types.

### Communication (Socket.IO)

Raw `ws` is gone. The sidecar (`packages/runtime/src/server`) hosts Socket.IO with:

- Typed event maps: `ClientToServerEvents` / `ServerToClientEvents` in `packages/protocol/src/wire.ts`
- Ack-based requests (`Result<T>` via `ok` / `fail`)
- Room broadcast per session (`session:<id>`)
- Connection state recovery (missed packets + room restore within a window)
- Modular handlers: `handlers/session.ts`, `workspace.ts`, `library.ts`

Typical flow:

1. Client connects → server emits `ready`
2. Client `session:open` → joins room, receives snapshot + resources
3. Client `session:prompt` → ack returns immediately; room receives `agent:event` stream, then `session:runEnd`
4. Disconnect/reconnect → Socket.IO recovery, or explicit reattach with `resumeSessionId`

### Working directory

Runtime can resolve, validate, browse, switch, and list recent workspaces:

- `workspace:browse` / `workspace:validate` / `workspace:switch` / `workspace:recent`
- Switching rebinds `NodeExecutionEnv`, reloads skills/templates, and updates the system prompt

### Desktop state (Redux Toolkit)

Slices under `apps/desktop/src/store/slices/`:

| Slice | Responsibility |
| --- | --- |
| `connection` | Socket status, ready epoch, protocol mismatch |
| `session` | Live session id, snapshot, resources, running flag |
| `transcript` | Messages, notices, streaming, tool progress |
| `config` | Draft vs applied `AgentConfig` (localStorage) |
| `approvals` | Pending tool approvals |
| `workspace` | Directory picker / validation / recent |
| `library` | Stored sessions + model inspect |
| `debug` | Event log + provider payloads |
| `ui` | Theme, locale, panel layout |

Thunks in `store/actions/` own every socket call. `socket/bridge.ts` only maps broadcasts → actions.

### Theme & i18n

- `styled-components` only (no global CSS feature styles)
- Black & white dual theme (`theme/themes.ts`) with semantic danger/warning
- Strict 4px spacing grid (`theme/tokens.ts` → `space[1]=4px` …)
- Proportional type scale (`xs` … `xxl`)
- Locales: `en-US` (canonical keys) and `zh-CN` only

## Protocol extension guide

1. Add types / events in `packages/protocol/src/*` and re-export from `index.ts`.
2. Bump `PROTOCOL_VERSION` in `wire.ts` when the contract is incompatible.
3. Implement the handler in `packages/runtime/src/server/handlers/`.
4. If it touches agent capability, wrap it in `AgentSession` — never patch agent/ai.
5. Add a smoke scenario in `packages/runtime/src/smoke.ts`.
6. Add a Redux action + UI surface in `apps/desktop`.

## Develop

Requires Node.js >= 22.19.

```bash
cd E:\agents\pine
pnpm install
pnpm prepare:sidecar   # bundle runtime + copy node.exe for Tauri
pnpm dev:runtime       # sidecar on :7821
pnpm dev:ui            # Vite UI
```

Tauri desktop build (Rust + VS Build Tools):

```bash
pnpm build:tauri
```

## Verify

```bash
pnpm --filter @pine/protocol typecheck
pnpm --filter @pine/runtime typecheck
pnpm --filter @pine/desktop exec tsc -p tsconfig.json --noEmit
pnpm smoke             # 100+ checks against a fake model server
pnpm try:ollama        # live Ollama probe (default gemma4:e4b)
```

## Ollama

Left panel → Model:

| Field | Value |
| --- | --- |
| API protocol | `openai-completions` |
| Provider id | `ollama` |
| Model id | e.g. `gemma4:e4b` |
| Base URL | `http://127.0.0.1:11434/v1` |
| API key | leave blank (or any placeholder) |

CLI probe:

```bash
pnpm try:ollama gemma4:e4b
pnpm try:ollama gemma4:e4b --think   # if the model reports thinking
```

## Package map

| Path | Role |
| --- | --- |
| `packages/telemetry` | Shared telemetry primitives |
| `packages/ai` | Providers (protected) |
| `packages/agent` | Agent loop (protected) |
| `packages/protocol` | Wire contract |
| `packages/runtime` | Sidecar glue + smoke tests |
| `apps/desktop` | React + Tauri UI |

Chinese end-user / codebase guide: see `中文说明文档.md`.
