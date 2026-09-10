import type { SagaIterator } from "redux-saga";
import { buffers, eventChannel, type EventChannel } from "redux-saga";
import { call, fork, put, take, takeLatest } from "redux-saga/effects";
import type { ChatEvent, FileResult, SessionListResult, SessionMessage, SessionSettingsDTO, SessionStatsDTO } from "@shared/types";
import { toErrorMessage } from "@shared/utils";
import {
  agentStarted,
  assistantEnded,
  assistantStarted,
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
  messageUsageReceived,
  newSessionRequest,
  newSessionSuccess,
  renameSessionFailure,
  renameSessionRequest,
  sendMessage,
  sessionStatsReceived,
  setActiveToolsRequest,
  setActiveToolsSuccess,
  setAutoCompactionRequest,
  settled,
  textDelta,
  thinkingDelta,
  toolEnded,
  toolPermissionRequested,
  toolPermissionsCleared,
  toolStarted,
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

function createChatEventChannel(): EventChannel<ChatEvent> {
  return eventChannel((emit) => {
    window.pi.onChatEvent((event) => emit(event));
    // The preload bridge has no unsubscribe API; this no-op keeps the
    // eventChannel contract explicit.
    return () => {};
  }, buffers.expanding(16));
}

/** Single place where main-process chat events become store actions. */
function* watchChatEvents(): SagaIterator {
  const channel = createChatEventChannel();
  try {
    while (true) {
      const event: ChatEvent = yield take(channel);
      switch (event.type) {
        case "agent_start":
          yield put(agentStarted());
          break;
        case "assistant_start":
          yield put(assistantStarted());
          break;
        case "text_delta":
          yield put(textDelta(event.delta));
          break;
        case "thinking_delta":
          yield put(thinkingDelta(event.delta));
          break;
        case "assistant_end":
          yield put(assistantEnded());
          break;
        case "message_usage":
          yield put(messageUsageReceived(event.usage));
          break;
        case "tool_start":
          yield put(toolStarted({ id: event.toolId, name: event.toolName, summary: event.summary, diff: event.diff }));
          break;
        case "tool_end":
          yield put(toolEnded({ id: event.toolId, isError: event.isError }));
          break;
        case "settled":
          yield put(settled());
          // The conversation was just persisted; refresh the session list and stats.
          yield put(listSessionsRequest());
          yield put(getSessionStatsRequest());
          break;
        case "session_stats":
          yield put(sessionStatsReceived(event.stats));
          break;
        case "tool_permission_request":
          yield put(toolPermissionRequested(event.request));
          break;
        case "tool_permission_cleared":
          yield put(toolPermissionsCleared());
          break;
        case "error":
          yield put(chatError(event.message));
          break;
      }
    }
  } finally {
    channel.close();
  }
}

export function* chatSaga(): SagaIterator {
  yield fork(watchChatEvents);
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
