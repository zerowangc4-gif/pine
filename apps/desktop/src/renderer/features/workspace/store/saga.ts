import type { SagaIterator } from "redux-saga";
import { buffers, eventChannel, type EventChannel } from "redux-saga";
import { call, fork, put, select, take, takeLatest } from "redux-saga/effects";
import type { FileResponse } from "@shared/types";
import { toErrorMessage } from "@shared/utils";
import type { RootState } from "@renderer/store";
import { dirname } from "@renderer/utils";
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
  revertFileFailure,
  revertFileRequest,
  revertFileSuccess,
  saveFileFailure,
  saveFileRequest,
  saveFileSuccess,
  setError,
} from "./slice";

/**
 * Narrows an intent-tagged {@link FileResponse} to the variant the caller
 * asked for. The renderer always knows which intent it sent, so a mismatch
 * here is a programming error worth surfacing.
 */
function expectFileResponse<T extends FileResponse["intent"]>(
  response: FileResponse,
  intent: T,
): Extract<FileResponse, { intent: T }> {
  if (response.intent !== intent) {
    throw new Error(`Unexpected file response: ${response.intent}`);
  }
  return response as Extract<FileResponse, { intent: T }>;
}

function* openFolderSaga(action: ReturnType<typeof openFolderRequest>): SagaIterator {
  try {
    const response: FileResponse = yield call(() =>
      window.pi.executeFile({ intent: "openFolder", title: action.payload }),
    );
    const { path } = expectFileResponse(response, "openFolder");
    if (path) {
      yield put(openFolderSuccess(path));
      yield put(loadDirRequest(path));
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
    const response: FileResponse = yield call(() =>
      window.pi.executeFile({ intent: "readDir", path: action.payload }),
    );
    const { entries } = expectFileResponse(response, "readDir");
    yield put(loadDirSuccess({ path: action.payload, entries }));
  } catch (error) {
    yield put(loadDirFailure({ path: action.payload, error: toErrorMessage(error) }));
  }
}

function* createFileSaga(action: ReturnType<typeof createFileRequest>): SagaIterator {
  try {
    const response: FileResponse = yield call(() =>
      window.pi.executeFile({
        intent: "createFile",
        dirPath: action.payload.dirPath,
        name: action.payload.name,
      }),
    );
    const { result } = expectFileResponse(response, "createFile");
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
    const response: FileResponse = yield call(() =>
      window.pi.executeFile({
        intent: "createFolder",
        dirPath: action.payload.dirPath,
        name: action.payload.name,
      }),
    );
    const { result } = expectFileResponse(response, "createFolder");
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
    const response: FileResponse = yield call(() =>
      window.pi.executeFile({ intent: "readFile", path: action.payload }),
    );
    const { content } = expectFileResponse(response, "readFile");
    yield put(openFileSuccess({ path: action.payload, content }));
  } catch (error) {
    yield put(openFileFailure({ path: action.payload, error: toErrorMessage(error) }));
  }
}

function* renameEntrySaga(action: ReturnType<typeof renameEntryRequest>): SagaIterator {
  try {
    const response: FileResponse = yield call(() =>
      window.pi.executeFile({ intent: "rename", path: action.payload.path, name: action.payload.name }),
    );
    const { result } = expectFileResponse(response, "rename");
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
    const response: FileResponse = yield call(() =>
      window.pi.executeFile({ intent: "delete", path: action.payload }),
    );
    const { result } = expectFileResponse(response, "delete");
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
      const response: FileResponse = yield call(() =>
        window.pi.executeFile({ intent: "readDir", path: dirPath }),
      );
      const { entries } = expectFileResponse(response, "readDir");
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
      const response: FileResponse = yield call(() =>
        window.pi.executeFile({ intent: "readFile", path: file.path }),
      );
      const { content } = expectFileResponse(response, "readFile");
      yield put(refreshFileSuccess({ path: file.path, content }));
    } catch {
      // The file may have been removed on disk; keep the tab as-is.
    }
  }
}

function* revertFileSaga(action: ReturnType<typeof revertFileRequest>): SagaIterator {
  const state: State = yield select((root: RootState) => root.workspace);
  const file = state.openFiles.find((item) => item.path === action.payload);
  if (!file || file.content === file.savedContent) {
    return;
  }
  try {
    // Reject an agent edit by writing the last user-saved baseline back to
    // disk. Without this the buffer only flips back in memory and the next
    // refresh pulls the agent version straight back in.
    const response: FileResponse = yield call(() =>
      window.pi.executeFile({ intent: "writeFile", path: file.path, content: file.savedContent }),
    );
    const { result } = expectFileResponse(response, "writeFile");
    if (result.ok) {
      yield put(revertFileSuccess(file.path));
    } else {
      yield put(revertFileFailure({ path: file.path, error: result.error ?? "error.operationFailed" }));
    }
  } catch (error) {
    yield put(revertFileFailure({ path: file.path, error: toErrorMessage(error) }));
  }
}

function* saveFileSaga(action: ReturnType<typeof saveFileRequest>): SagaIterator {
  const state: State = yield select((root: RootState) => root.workspace);
  const file = state.openFiles.find((item) => item.path === action.payload);
  if (!file) {
    return;
  }
  try {
    const response: FileResponse = yield call(() =>
      window.pi.executeFile({ intent: "writeFile", path: file.path, content: file.content }),
    );
    const { result } = expectFileResponse(response, "writeFile");
    if (result.ok) {
      yield put(saveFileSuccess({ path: file.path, content: file.content }));
    } else {
      yield put(saveFileFailure({ path: file.path, error: result.error ?? "error.operationFailed" }));
    }
  } catch (error) {
    yield put(saveFileFailure({ path: file.path, error: toErrorMessage(error) }));
  }
}

function createFilesChangedChannel(): EventChannel<boolean> {
  return eventChannel((emit) => {
    const refresh = () => emit(true);
    window.pi.onFilesChanged(refresh);
    // VSCode-like: also refresh when the window regains focus, in case the
    // file watcher missed changes made while the app was in the background.
    window.addEventListener("focus", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
    };
  }, buffers.expanding(8));
}

/** Single place where filesystem-change signals trigger a workspace refresh. */
function* watchFilesChanged(): SagaIterator {
  const channel = createFilesChangedChannel();
  try {
    while (true) {
      yield take(channel);
      yield put(refreshTreeRequest());
    }
  } finally {
    channel.close();
  }
}

export function* workspaceSaga(): SagaIterator {
  yield fork(watchFilesChanged);
  yield takeLatest(openFolderRequest.type, openFolderSaga);
  yield takeLatest(loadDirRequest.type, loadDirSaga);
  yield takeLatest(createFileRequest.type, createFileSaga);
  yield takeLatest(createFolderRequest.type, createFolderSaga);
  yield takeLatest(renameEntryRequest.type, renameEntrySaga);
  yield takeLatest(deleteEntryRequest.type, deleteEntrySaga);
  yield takeLatest(refreshTreeRequest.type, refreshTreeSaga);
  yield takeLatest(openFileRequest.type, openFileSaga);
  yield takeLatest(saveFileRequest.type, saveFileSaga);
  yield takeLatest(revertFileRequest.type, revertFileSaga);
}
