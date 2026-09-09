# Pine Desktop

Electron desktop app for [Pi](https://github.com/earendil-works/pi) — connect a model, open a folder, and chat with a coding assistant that can read, edit, and run code in that folder.

## Tech stack

- **Electron + electron-vite** — desktop shell and build tooling
- **React 19 + TypeScript** — renderer UI
- **Redux Toolkit + redux-saga** — renderer state and side effects
- **styled-components + ThemeProvider** — styling (single source of truth in `src/renderer/theme`)
- **i18next + react-i18next** — zh-CN / en-US localization
- **react-router-dom** — hash-based routing (`/login`, `/chat`)
- **react-markdown + remark-gfm** — assistant message rendering
- **@earendil-works/pi-coding-agent** — the agent SDK (runs in the main process only)

## How it runs

```
renderer (React UI + Redux)
   │  window.pi.*          (typed bridge, see src/shared/types.ts)
   ▼
preload (contextBridge)     src/preload/index.ts
   │  ipcRenderer.invoke    (channel names in src/shared/ipc.ts)
   ▼
main (Node)                 src/main/
   │  ipc handlers          src/main/ipc/*
   │  PineService           src/main/services/pine-service.ts
   ▼
@earendil-works/pi-coding-agent
```

- The **renderer never touches Node APIs or the agent SDK**. It only calls the `window.pi` bridge.
- The **main process owns all Node state** (model runtime, credentials, the agent session, the workspace folder).
- Everything that crosses the process boundary is a plain JSON-serializable type declared in `src/shared/types.ts`.

## Directory layout

```
src/
  shared/                  Types + constants used by main, preload, and renderer
    types.ts               Data types and the Pi bridge interface
    ipc.ts                 IPC channel name constants
    errors.ts              Error i18n keys (error.*) emitted by the main process
    utils.ts               Cross-process helpers (toErrorMessage)
  main/                    Main process (Node)
    index.ts               Entry: window + wiring
    core/                  SDK re-exports + base prompt
      pi.ts                The ONLY place SDK capabilities are re-exported from
      prompt.ts            Minimal base system prompt
    ipc/                   Thin ipcMain handlers, grouped by domain
      providers.ts         list-providers, connect, switch-model, thinking-level
      files.ts             open-folder, read-dir, create/read/write file
      chat.ts              chat send/abort
      sessions.ts          session list/load/delete/rename/settings
      skills.ts            skill list/create
      system.ts            clipboard copy/read
    services/              Main-process logic (one concern per file)
      pine-service.ts      PineService facade: runtime, connection, workspace, session
      resources.ts         project resource loader (skills/extensions/context files)
      messages.ts          session message extraction helpers
  preload/
    index.ts               Exposes window.pi via contextBridge
  renderer/                Renderer process (React)
    main.tsx               Entry: ThemeProvider + HashRouter + Redux + i18n
    App.tsx                Route definitions and guards
    theme/                 Theme tokens + GlobalStyle
    i18n/                  i18next init + zh-CN / en-US message catalogs
    components/            Reusable UI: Dropdown, Modal, icons, LanguageSwitcher
    utils/                 Small renderer helpers (id, path, error display)
    store/                 Redux store + rootSaga
    features/              Feature slices (colocated state, sagas, UI)
      login/               Provider/model/key selection
      workspace/           File explorer + editor tabs
      chat/                Chat page, messages, tool activity
```

Each feature follows the same shape:

```
features/<name>/
  types/state.ts           Redux state shape for this feature
  store/slice.ts           Redux Toolkit slice (reducers + actions)
  store/saga.ts            Side effects (window.pi calls)
  store/index.ts           Re-exports slice + saga
  components/ or pages/    Presentational components
  index.ts                 Public exports
```

## Conventions

### State management

- **Actions that trigger async work** are named `*Request` and have an empty reducer (e.g. `openFolderRequest`, `createFileRequest`). Their payload carries the input.
- **Actions that record results** are named `*Success` / `*Failure` (e.g. `openFileSuccess`, `loadDirFailure`).
- **Reducers stay pure**: id generation uses `utils/id.ts` (`crypto.randomUUID`), no side effects.
- Sagas never import `useTranslation`; they store i18n keys or raw messages and the UI translates them at render time.

### Error handling

- The main process returns **i18n keys** for known failures (`AppError` in `shared/errors.ts`, e.g. `error.noFolder`) and raw technical messages for anything unexpected.
- `utils/error.ts` (`errorText`) translates a string if it is a known i18n key, otherwise renders it unchanged.
- Known error keys live under the `error.*` namespace in the locale catalogs.

### Styling

- No hardcoded colors. All styled components use `({ theme }) => theme.colors.*` / `theme.gradients.*` / `theme.spacing.*` etc.
- Add new design tokens to `src/renderer/theme/theme.ts`; the `Theme` interface is the contract.
- Icons are plain SVG components in `src/renderer/components/icons.tsx` (single place, no duplication).

### Localization

- All user-facing strings go through `t("feature.key")` via `useTranslation`.
- Add a key to **both** `src/renderer/i18n/locales/zh-CN.json` and `en-US.json`.

## Commands

```bash
# from the repo root
pnpm dev                 # run the desktop app
pnpm build               # build the desktop app
pnpm --filter @pine/desktop typecheck
npx eslint apps/desktop/src
```

## Key flows

### Login

`Login` page → `loadProviders` → `window.pi.listProviders()` → `PineService.listProviders()` → select provider/model + API key → `connectRequest` → `PineService.connect()` (sets a runtime-only API key and verifies it with a single ping request) → `connected` state → navigate to `/chat`.

### Folder & files

`FileExplorer` → `openFolderRequest` → native dialog in the main process → `PineService.setWorkspaceRoot()` → `loadDirRequest(root)` reads the first level. Directories load lazily on expand. All file IPC validates paths stay inside the workspace root (`resolveWithinRoot` in `main/ipc/files.ts`).

### Chat

`ChatView` send → `sendMessage` (adds the user bubble) → saga calls `window.pi.sendMessage()` → `PineService.sendChatMessage()` lazily creates an `AgentSession` bound to the workspace folder (in-memory session, custom `ResourceLoader`, no default config loaded) and calls `session.prompt()`. Agent events are reduced to `ChatEvent`s and streamed back over the `chat:event` channel; `ChatPage` maps them into the chat slice.

- **Images** are attached via paste (Ctrl+V) / drag-drop / right-click paste / file picker, sent as `ImageContent` (base64). Only models with `acceptsImages` accept them; the model dropdown marks such models with a "视觉" badge.
- **While streaming** the composer offers **追问 (followUp)** and **打断 (steer)** instead of a plain send; the main process calls `session.followUp()` / `session.steer()` directly. The message list keeps the user at the bottom only while they are already near the bottom (no forced scroll lock).

## Feature map

Where each capability lives (find → change here):

| Capability | Main / preload / shared | Renderer |
| --- | --- | --- |
| Provider/model list, connect, switch, thinking level | `services/pine-service.ts` · `ipc/providers.ts` | `features/login/` |
| Folder & file tree, create/rename/delete, auto-refresh | `ipc/files.ts` | `features/workspace/components/FileExplorer.tsx` + `store/` |
| Editor + line numbers + save + **diff view** | — | `features/workspace/components/EditorView.tsx` + `DiffView.tsx` |
| Chat send/abort, streaming events, **images**, per-message cost | `services/pine-service.ts` · `services/messages.ts` · `ipc/chat.ts` | `features/chat/components/ChatView.tsx` · `ComposerBar.tsx` |
| Sessions list/load/rename/delete/settings/auto-compaction | `services/pine-service.ts` · `ipc/sessions.ts` | `features/chat/components/SessionsPanel.tsx` · `ComposerBar.tsx` |
| **Skills** (list + create) | `services/resources.ts` · `ipc/skills.ts` | `features/chat/components/SkillsModal.tsx` |
| **Tool permissions** (enable/disable bash/edit/write) | `services/pine-service.ts` · `ipc/providers.ts` | `features/chat/components/PermissionsModal.tsx` |
| **Extensions** + context files (AGENTS.md/SYSTEM.md) | `services/resources.ts` | — |
| Clipboard (copy text / read image) | `ipc/system.ts` | `ChatView.tsx` (paste menu) |
| i18n strings | `shared/errors.ts` (error keys) | `renderer/i18n/locales/*.json` |

## How to add a new capability (checklist)

Any new cross-process capability follows the same 5 steps. Do all of them:

1. **Type** — add the method + payload types to `shared/types.ts` (`Pi` interface).
2. **Channel** — add a channel constant to `shared/ipc.ts`.
3. **Bridge** — wire it in `preload/index.ts` (`window.pi.*`).
4. **Handler + logic** — add an `ipcMain.handle` in `main/ipc/<domain>.ts`; put real logic in `PineService` (or a `services/*.ts` module). If it uses a new SDK capability, first re-export it from `main/core/pi.ts`.
5. **Renderer** — call it from a saga (`store/saga.ts`) or directly for transient UI state, and add any user-facing strings to **both** locale files.

## Notes

- The agent runs with the default coding tools (`read`, `bash`, `edit`, `write`) scoped to the opened folder.
- Credentials are kept **in memory only** (`InMemoryCredentialStore` + `setRuntimeApiKey`) and are lost on app restart.
- The explorer auto-refreshes via a file watcher + window-focus refresh; there is no manual refresh button.
- Project skills load from `.pi/skills` and `.agents/skills`; project extensions load from `.pi/extensions` and `.agents/extensions`; project `AGENTS.md` / `SYSTEM.md` are injected into the system prompt.
- Creating a skill via the UI also regenerates `.pi/skills/README.md`, a browsable index of all skills (the agent additionally sees skills in its system prompt).
- Tool permissions are **in-memory toggles only** (no per-call approval): `read` is always on; `bash` / `edit` / `write` can be toggled from the shield button in the composer. Changes apply to the next session immediately.
- Global `~/.pi/agent` config is intentionally **never** loaded (the app passes the project root as `agentDir`).
