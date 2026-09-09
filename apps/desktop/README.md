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
    ipc/                   Thin ipcMain handlers, grouped by domain
      providers.ts         list-providers, connect
      files.ts             open-folder, read-dir, create/read/write file
      chat.ts              chat send/abort
    services/
      pine-service.ts      PineService: owns runtime, connection, workspace, session
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

## Notes

- The agent runs with the default coding tools (`read`, `bash`, `edit`, `write`) scoped to the opened folder.
- Credentials are kept **in memory only** (`InMemoryCredentialStore` + `setRuntimeApiKey`) and are lost on app restart.
- After the agent edits files, the explorer does not auto-refresh; open a different folder or restart to rescan.
