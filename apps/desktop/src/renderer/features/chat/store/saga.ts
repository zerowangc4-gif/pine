import type { SagaIterator } from "redux-saga";
import { call, put, takeLatest } from "redux-saga/effects";
import type { FileResult, SessionListResult, SessionMessage, SessionSettingsDTO, SessionStatsDTO } from "@shared/types";
import { toErrorMessage } from "@shared/utils";
import {
  chatError,
  deleteSessionFailure,
  deleteSessionRequest,
  deleteSessionSuccess,
  exportSessionFailure,
  exportSessionRequest,
  getActiveToolsRequest,
  getActiveToolsSuccess,
  getSessionSettingsRequest,
  getSessionSettingsSuccess,
  getSessionStatsRequest,
  getSessionStatsSuccess,
  listSessionsFailure,
  listSessionsRequest,
  listSessionsSuccess,
  loadSessionFailure,
  loadSessionRequest,
  loadSessionSuccess,
  newSessionRequest,
  newSessionSuccess,
  renameSessionFailure,
  renameSessionRequest,
  sendMessage,
  setActiveToolsRequest,
  setActiveToolsSuccess,
  setAutoCompactionRequest,
} from "./slice";

function* sendMessageSaga(action: ReturnType<typeof sendMessage>): SagaIterator {
  try {
    yield call(() => window.pi.sendMessage(action.payload));
  } catch (error) {
    yield put(chatError(toErrorMessage(error)));
  }
}

function* listSessionsSaga(): SagaIterator {
  try {
    const result: SessionListResult = yield call(() => window.pi.listSessions());
    yield put(listSessionsSuccess({ sessions: result.sessions, activePath: result.activePath }));
  } catch (error) {
    yield put(listSessionsFailure(toErrorMessage(error)));
  }
}

function* loadSessionSaga(action: ReturnType<typeof loadSessionRequest>): SagaIterator {
  try {
    const messages: SessionMessage[] = yield call(() => window.pi.loadSession(action.payload));
    yield put(loadSessionSuccess({ path: action.payload, messages }));
    yield put(getSessionStatsRequest());
    yield put(getSessionSettingsRequest());
    yield put(listSessionsRequest());
  } catch (error) {
    yield put(loadSessionFailure(toErrorMessage(error)));
  }
}

function* deleteSessionSaga(action: ReturnType<typeof deleteSessionRequest>): SagaIterator {
  try {
    const result: FileResult = yield call(() => window.pi.deleteSession(action.payload));
    if (result.ok) {
      yield put(deleteSessionSuccess(action.payload));
    } else {
      yield put(deleteSessionFailure(result.error ?? "error.operationFailed"));
    }
  } catch (error) {
    yield put(deleteSessionFailure(toErrorMessage(error)));
  }
}

function* getSessionStatsSaga(): SagaIterator {
  try {
    const stats: SessionStatsDTO = yield call(() => window.pi.getSessionStats());
    yield put(getSessionStatsSuccess(stats));
  } catch {
    // No active session yet; leave the stats empty.
  }
}

function* getSessionSettingsSaga(): SagaIterator {
  try {
    const settings: SessionSettingsDTO = yield call(() => window.pi.getSessionSettings());
    yield put(getSessionSettingsSuccess(settings));
  } catch {
    // No active session yet; leave the settings empty.
  }
}

function* exportSessionSaga(action: ReturnType<typeof exportSessionRequest>): SagaIterator {
  try {
    const result: FileResult = yield call(() => window.pi.exportSession(action.payload));
    if (!result.ok) {
      yield put(exportSessionFailure(result.error ?? "error.operationFailed"));
    }
  } catch (error) {
    yield put(exportSessionFailure(toErrorMessage(error)));
  }
}

function* setAutoCompactionSaga(action: ReturnType<typeof setAutoCompactionRequest>): SagaIterator {
  try {
    yield call(() => window.pi.setAutoCompaction(action.payload));
    yield put(getSessionSettingsRequest());
  } catch (error) {
    yield put(chatError(toErrorMessage(error)));
  }
}

function* getActiveToolsSaga(): SagaIterator {
  try {
    const tools: string[] = yield call(() => window.pi.getActiveTools());
    yield put(getActiveToolsSuccess(tools));
  } catch {
    // Keep the default tool set.
  }
}

function* setActiveToolsSaga(action: ReturnType<typeof setActiveToolsRequest>): SagaIterator {
  try {
    yield call(() => window.pi.setActiveTools(action.payload));
    yield put(setActiveToolsSuccess(action.payload));
  } catch (error) {
    yield put(chatError(toErrorMessage(error)));
  }
}

function* renameSessionSaga(action: ReturnType<typeof renameSessionRequest>): SagaIterator {
  try {
    const result: FileResult = yield call(() => window.pi.renameSession(action.payload));
    if (result.ok) {
      yield put(listSessionsRequest());
    } else {
      yield put(renameSessionFailure(result.error ?? "error.operationFailed"));
    }
  } catch (error) {
    yield put(renameSessionFailure(toErrorMessage(error)));
  }
}

function* newSessionSaga(): SagaIterator {
  try {
    yield call(() => window.pi.newSession());
    yield put(newSessionSuccess());
    yield put(listSessionsRequest());
    // Reset the stats bar to zero so it stays visible after clearing the chat.
    yield put(getSessionStatsRequest());
  } catch (error) {
    yield put(chatError(toErrorMessage(error)));
  }
}

export function* chatSaga(): SagaIterator {
  yield takeLatest(sendMessage.type, sendMessageSaga);
  yield takeLatest(listSessionsRequest.type, listSessionsSaga);
  yield takeLatest(loadSessionRequest.type, loadSessionSaga);
  yield takeLatest(deleteSessionRequest.type, deleteSessionSaga);
  yield takeLatest(newSessionRequest.type, newSessionSaga);
  yield takeLatest(renameSessionRequest.type, renameSessionSaga);
  yield takeLatest(getSessionStatsRequest.type, getSessionStatsSaga);
  yield takeLatest(getSessionSettingsRequest.type, getSessionSettingsSaga);
  yield takeLatest(setAutoCompactionRequest.type, setAutoCompactionSaga);
  yield takeLatest(exportSessionRequest.type, exportSessionSaga);
  yield takeLatest(getActiveToolsRequest.type, getActiveToolsSaga);
  yield takeLatest(setActiveToolsRequest.type, setActiveToolsSaga);
}
