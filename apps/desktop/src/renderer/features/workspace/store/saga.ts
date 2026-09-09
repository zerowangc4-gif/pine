import type { SagaIterator } from "redux-saga";
import { call, put, select, takeLatest } from "redux-saga/effects";
import type { DirEntry, FileResult } from "@shared/types";
import { toErrorMessage } from "@shared/utils";
import type { RootState } from "@renderer/store";
import { dirname } from "@renderer/utils/path";
import { listSessionsRequest, newSessionRequest } from "../../chat/store";
import type { State } from "../types/state";
import {
  createFileRequest,
  createFolderRequest,
  deleteEntryRequest,
  deleteEntrySuccess,
  loadDirFailure,
  loadDirRequest,
  loadDirSuccess,
  openFileFailure,
  openFileRequest,
  openFileSuccess,
  openFolderRequest,
  openFolderSuccess,
  refreshFileSuccess,
  refreshTreeRequest,
  renameEntryRequest,
  renameEntrySuccess,
  saveFileFailure,
  saveFileRequest,
  saveFileSuccess,
  setError,
} from "./slice";

function* openFolderSaga(action: ReturnType<typeof openFolderRequest>): SagaIterator {
  try {
    const root: string | undefined = yield call(() => window.pi.openFolder(action.payload));
    if (root) {
      yield put(openFolderSuccess(root));
      yield put(loadDirRequest(root));
      // A new workspace starts with a clean conversation; the saved sessions are
      // refreshed so the user can continue earlier work in this folder.
      yield put(newSessionRequest());
      yield put(listSessionsRequest());
    }
  } catch (error) {
    yield put(setError(toErrorMessage(error)));
  }
}

function* loadDirSaga(action: ReturnType<typeof loadDirRequest>): SagaIterator {
  try {
    const entries: DirEntry[] = yield call(() => window.pi.readDir(action.payload));
    yield put(loadDirSuccess({ path: action.payload, entries }));
  } catch (error) {
    yield put(loadDirFailure({ path: action.payload, error: toErrorMessage(error) }));
  }
}

function* createFileSaga(action: ReturnType<typeof createFileRequest>): SagaIterator {
  try {
    const result: FileResult = yield call(() =>
      window.pi.createFile(action.payload.dirPath, action.payload.name),
    );
    if (result.ok) {
      yield put(loadDirRequest(action.payload.dirPath));
    } else {
      yield put(setError(result.error ?? "error.operationFailed"));
    }
  } catch (error) {
    yield put(setError(toErrorMessage(error)));
  }
}

function* createFolderSaga(action: ReturnType<typeof createFolderRequest>): SagaIterator {
  try {
    const result: FileResult = yield call(() =>
      window.pi.createFolder(action.payload.dirPath, action.payload.name),
    );
    if (result.ok) {
      yield put(loadDirRequest(action.payload.dirPath));
    } else {
      yield put(setError(result.error ?? "error.operationFailed"));
    }
  } catch (error) {
    yield put(setError(toErrorMessage(error)));
  }
}

function* openFileSaga(action: ReturnType<typeof openFileRequest>): SagaIterator {
  try {
    const content: string = yield call(() => window.pi.readFile(action.payload));
    yield put(openFileSuccess({ path: action.payload, content }));
  } catch (error) {
    yield put(openFileFailure({ path: action.payload, error: toErrorMessage(error) }));
  }
}

function* renameEntrySaga(action: ReturnType<typeof renameEntryRequest>): SagaIterator {
  try {
    const result: FileResult = yield call(() =>
      window.pi.renameEntry(action.payload.path, action.payload.name),
    );
    if (result.ok && result.path) {
      yield put(renameEntrySuccess({ oldPath: action.payload.path, newPath: result.path }));
      yield put(loadDirRequest(dirname(action.payload.path)));
    } else {
      yield put(setError(result.error ?? "error.operationFailed"));
    }
  } catch (error) {
    yield put(setError(toErrorMessage(error)));
  }
}

function* deleteEntrySaga(action: ReturnType<typeof deleteEntryRequest>): SagaIterator {
  try {
    const result: FileResult = yield call(() => window.pi.deleteEntry(action.payload));
    if (result.ok) {
      yield put(deleteEntrySuccess(action.payload));
    } else {
      yield put(setError(result.error ?? "error.operationFailed"));
    }
  } catch (error) {
    yield put(setError(toErrorMessage(error)));
  }
}

function* refreshTreeSaga(): SagaIterator {
  const state: State = yield select((root: RootState) => root.workspace);
  if (!state.rootPath) {
    return;
  }

  const dirPaths = new Set<string>([state.rootPath]);
  for (const node of Object.values(state.nodes)) {
    if (node.type === "dir" && (node.expanded || node.loaded)) {
      dirPaths.add(node.path);
    }
  }

  for (const dirPath of dirPaths) {
    try {
      const entries: DirEntry[] = yield call(() => window.pi.readDir(dirPath));
      yield put(loadDirSuccess({ path: dirPath, entries }));
    } catch {
      // The directory may have been removed on disk; skip it.
    }
  }

  // Reload clean editor tabs so agent edits show up without clobbering unsaved work.
  for (const file of state.openFiles) {
    if (file.content !== file.savedContent) {
      continue;
    }
    try {
      const content: string = yield call(() => window.pi.readFile(file.path));
      yield put(refreshFileSuccess({ path: file.path, content }));
    } catch {
      // The file may have been removed on disk; keep the tab as-is.
    }
  }
}

function* saveFileSaga(action: ReturnType<typeof saveFileRequest>): SagaIterator {
  const state: State = yield select((root: RootState) => root.workspace);
  const file = state.openFiles.find((item) => item.path === action.payload);
  if (!file) {
    return;
  }
  try {
    const result: FileResult = yield call(() => window.pi.writeFile(file.path, file.content));
    if (result.ok) {
      yield put(saveFileSuccess({ path: file.path, content: file.content }));
    } else {
      yield put(saveFileFailure({ path: file.path, error: result.error ?? "error.operationFailed" }));
    }
  } catch (error) {
    yield put(saveFileFailure({ path: file.path, error: toErrorMessage(error) }));
  }
}

export function* workspaceSaga(): SagaIterator {
  yield takeLatest(openFolderRequest.type, openFolderSaga);
  yield takeLatest(loadDirRequest.type, loadDirSaga);
  yield takeLatest(createFileRequest.type, createFileSaga);
  yield takeLatest(createFolderRequest.type, createFolderSaga);
  yield takeLatest(renameEntryRequest.type, renameEntrySaga);
  yield takeLatest(deleteEntryRequest.type, deleteEntrySaga);
  yield takeLatest(refreshTreeRequest.type, refreshTreeSaga);
  yield takeLatest(openFileRequest.type, openFileSaga);
  yield takeLatest(saveFileRequest.type, saveFileSaga);
}
