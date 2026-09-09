import type { SagaIterator } from "redux-saga";
import { call, put, select, takeLatest } from "redux-saga/effects";
import type { DirEntry, FileResult } from "@shared/types";
import { toErrorMessage } from "@shared/utils";
import type { RootState } from "@renderer/store";
import type { State } from "../types/state";
import {
  createFileRequest,
  createFolderRequest,
  loadDirFailure,
  loadDirRequest,
  loadDirSuccess,
  openFileFailure,
  openFileRequest,
  openFileSuccess,
  openFolderRequest,
  openFolderSuccess,
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
  yield takeLatest(openFileRequest.type, openFileSaga);
  yield takeLatest(saveFileRequest.type, saveFileSaga);
}
