import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DirEntry } from "@shared/types";
import { basename } from "@renderer/utils/path";
import type { State } from "../types/state";

const initialState: State = {
  nodes: {},
  openFiles: [],
};

export const workspaceSlice = createSlice({
  name: "workspace",
  initialState,
  reducers: {
    openFolderRequest(_state, _action: PayloadAction<string>) {},
    openFolderSuccess(state, action: PayloadAction<string>) {
      state.rootPath = action.payload;
      state.rootName = basename(action.payload);
      state.nodes = {};
      state.openFiles = [];
      state.activePath = undefined;
      state.error = undefined;
    },

    loadDirRequest(state, action: PayloadAction<string>) {
      const node = state.nodes[action.payload] ?? {
        path: action.payload,
        name: basename(action.payload),
        type: "dir" as const,
      };
      node.loading = true;
      state.nodes[action.payload] = node;
    },
    loadDirSuccess(state, action: PayloadAction<{ path: string; entries: DirEntry[] }>) {
      const { path, entries } = action.payload;
      const parent = state.nodes[path] ?? {
        path,
        name: basename(path),
        type: "dir" as const,
      };
      parent.loaded = true;
      parent.loading = false;
      parent.children = entries.map((entry) => entry.path);
      state.nodes[path] = parent;

      for (const entry of entries) {
        state.nodes[entry.path] ??= {
          path: entry.path,
          name: entry.name,
          type: entry.type,
        };
      }
    },
    loadDirFailure(state, action: PayloadAction<{ path: string; error: string }>) {
      const node = state.nodes[action.payload.path];
      if (node) {
        node.loading = false;
      }
      state.error = action.payload.error;
    },

    toggleDir(state, action: PayloadAction<string>) {
      const node = state.nodes[action.payload];
      if (node && node.type === "dir") {
        node.expanded = !node.expanded;
      }
    },

    createFileRequest(_state, _action: PayloadAction<{ dirPath: string; name: string }>) {},
    createFolderRequest(_state, _action: PayloadAction<{ dirPath: string; name: string }>) {},

    openFileRequest(_state, _action: PayloadAction<string>) {},
    openFileSuccess(state, action: PayloadAction<{ path: string; content: string }>) {
      const { path, content } = action.payload;
      const existing = state.openFiles.find((file) => file.path === path);
      if (existing) {
        existing.content = content;
        existing.savedContent = content;
        existing.loading = false;
      } else {
        state.openFiles.push({
          path,
          name: basename(path),
          content,
          savedContent: content,
        });
      }
      state.activePath = path;
    },
    openFileFailure(state, action: PayloadAction<{ path: string; error: string }>) {
      const existing = state.openFiles.find((file) => file.path === action.payload.path);
      if (existing) {
        existing.loading = false;
      }
      state.error = action.payload.error;
    },

    closeFile(state, action: PayloadAction<string>) {
      const index = state.openFiles.findIndex((file) => file.path === action.payload);
      if (index >= 0) {
        state.openFiles.splice(index, 1);
      }
      if (state.activePath === action.payload) {
        state.activePath = state.openFiles[Math.max(0, index - 1)]?.path;
      }
    },
    setActivePath(state, action: PayloadAction<string | undefined>) {
      state.activePath = action.payload;
    },

    editFile(state, action: PayloadAction<{ path: string; content: string }>) {
      const file = state.openFiles.find((item) => item.path === action.payload.path);
      if (file) {
        file.content = action.payload.content;
      }
    },
    saveFileRequest(_state, _action: PayloadAction<string>) {},
    saveFileSuccess(state, action: PayloadAction<{ path: string; content: string }>) {
      const file = state.openFiles.find((item) => item.path === action.payload.path);
      if (file) {
        file.savedContent = action.payload.content;
      }
    },
    saveFileFailure(state, action: PayloadAction<{ path: string; error: string }>) {
      state.error = action.payload.error;
    },

    setError(state, action: PayloadAction<string>) {
      state.error = action.payload;
    },
    clearWorkspaceError(state) {
      state.error = undefined;
    },
  },
});

export const {
  openFolderRequest,
  openFolderSuccess,
  loadDirRequest,
  loadDirSuccess,
  loadDirFailure,
  toggleDir,
  createFileRequest,
  createFolderRequest,
  openFileRequest,
  openFileSuccess,
  openFileFailure,
  closeFile,
  setActivePath,
  editFile,
  saveFileRequest,
  saveFileSuccess,
  saveFileFailure,
  setError,
  clearWorkspaceError,
} = workspaceSlice.actions;
