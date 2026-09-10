import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { DirEntry } from "@shared/types";
import { basename, isPathUnder, remapPath } from "@renderer/utils";
import type { FileNode, State } from "../types/state";

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

    renameEntryRequest(_state, _action: PayloadAction<{ path: string; name: string }>) {},
    renameEntrySuccess(state, action: PayloadAction<{ oldPath: string; newPath: string }>) {
      const { oldPath, newPath } = action.payload;
      const nextNodes: Record<string, FileNode> = {};
      for (const [key, node] of Object.entries(state.nodes)) {
        const mappedPath = remapPath(key, oldPath, newPath);
        nextNodes[mappedPath] = {
          ...node,
          path: mappedPath,
          name: mappedPath === newPath ? basename(newPath) : node.name,
          children: node.children?.map((child) => remapPath(child, oldPath, newPath)),
        };
      }
      state.nodes = nextNodes;
      state.openFiles = state.openFiles.map((file) => {
        const mappedPath = remapPath(file.path, oldPath, newPath);
        return mappedPath === file.path ? file : { ...file, path: mappedPath, name: basename(mappedPath) };
      });
      if (state.activePath) {
        state.activePath = remapPath(state.activePath, oldPath, newPath);
      }
    },

    deleteEntryRequest(_state, _action: PayloadAction<string>) {},
    deleteEntrySuccess(state, action: PayloadAction<string>) {
      const removed = action.payload;
      for (const key of Object.keys(state.nodes)) {
        if (isPathUnder(key, removed)) {
          delete state.nodes[key];
        }
      }
      for (const node of Object.values(state.nodes)) {
        if (node.children) {
          node.children = node.children.filter((child) => !isPathUnder(child, removed));
        }
      }
      state.openFiles = state.openFiles.filter((file) => !isPathUnder(file.path, removed));
      if (state.activePath && isPathUnder(state.activePath, removed)) {
        state.activePath = state.openFiles[0]?.path;
      }
    },

    refreshTreeRequest(_state) {},
    collapseAll(state) {
      for (const node of Object.values(state.nodes)) {
        if (node.type === "dir") {
          node.expanded = false;
        }
      }
    },

    openFileRequest(_state, _action: PayloadAction<string>) {},
    openFileSuccess(state, action: PayloadAction<{ path: string; content: string }>) {
      const { path, content } = action.payload;
      const existing = state.openFiles.find((file) => file.path === path);
      if (existing) {
        // Re-opening a dirty tab must not discard unsaved edits. A clean tab is
        // refreshed from disk (accepting its current state as the baseline); a
        // dirty tab keeps its buffer and saved baseline untouched.
        if (existing.content === existing.savedContent) {
          existing.content = content;
          existing.savedContent = content;
          existing.previousContent = undefined;
        }
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

    refreshFileSuccess(state, action: PayloadAction<{ path: string; content: string }>) {
      const file = state.openFiles.find((item) => item.path === action.payload.path);
      if (file && file.content !== action.payload.content) {
        file.previousContent = file.content;
        file.content = action.payload.content;
        // Keep `savedContent` as the last user-saved version. An external
        // (agent) edit therefore surfaces as a dirty, reviewable diff instead
        // of being silently accepted into the saved baseline.
      }
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
    revertFileRequest(_state, _action: PayloadAction<string>) {},
    revertFileSuccess(state, action: PayloadAction<string>) {
      const file = state.openFiles.find((item) => item.path === action.payload);
      if (file) {
        file.content = file.savedContent;
        file.previousContent = undefined;
      }
    },
    revertFileFailure(state, action: PayloadAction<{ path: string; error: string }>) {
      state.error = action.payload.error;
    },
    saveFileRequest(_state, _action: PayloadAction<string>) {},
    saveFileSuccess(state, action: PayloadAction<{ path: string; content: string }>) {
      const file = state.openFiles.find((item) => item.path === action.payload.path);
      if (file) {
        file.savedContent = action.payload.content;
        file.previousContent = undefined;
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
  renameEntryRequest,
  renameEntrySuccess,
  deleteEntryRequest,
  deleteEntrySuccess,
  refreshTreeRequest,
  collapseAll,
  openFileRequest,
  openFileSuccess,
  openFileFailure,
  refreshFileSuccess,
  closeFile,
  setActivePath,
  editFile,
  revertFileRequest,
  revertFileSuccess,
  revertFileFailure,
  saveFileRequest,
  saveFileSuccess,
  saveFileFailure,
  setError,
  clearWorkspaceError,
} = workspaceSlice.actions;
