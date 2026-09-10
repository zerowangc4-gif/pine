import type { SagaIterator } from "redux-saga";
import { call, put, select, takeLatest } from "redux-saga/effects";
import type { ActiveModelInfo, ProviderInfo } from "@shared/types";
import { toErrorMessage } from "@shared/utils";
import type { RootState } from "@renderer/store";
import type { State } from "../types/state";
import {
  connectFailure,
  connectRequest,
  connectSuccess,
  connectWithKeyFailure,
  connectWithKeyRequest,
  connectWithKeySuccess,
  disconnectRequest,
  disconnectSuccess,
  getActiveModelRequest,
  getActiveModelSuccess,
  loadProviders,
  loadProvidersFailure,
  loadProvidersSuccess,
  setThinkingLevelRequest,
  setThinkingLevelSuccess,
  switchModelRequest,
  switchModelSuccess,
} from "./slice";
import { chatError } from "../../chat/store";

function* loadProvidersSaga(): SagaIterator {
  try {
    const providers: ProviderInfo[] = yield call(() => window.pi.listProviders());
    yield put(loadProvidersSuccess(providers));
  } catch (error) {
    yield put(loadProvidersFailure(toErrorMessage(error)));
  }
}

function* connectSaga(): SagaIterator {
  try {
    const state: State = yield select((root: RootState) => root.login);
    if (!state.selectedProvider || !state.selectedModel) {
      yield put(connectFailure("login.selectProviderAndModel"));
      return;
    }

    const result = yield call(() =>
      window.pi.connect({
        provider: state.selectedProvider!,
        model: state.selectedModel!,
        apiKey: state.apiKey,
      }),
    );

    if (result.ok) {
      yield put(connectSuccess());
      // Refresh so `configured` flags (and therefore the model list in the
      // chat composer) reflect the key that was just activated.
      yield put(loadProviders());
    } else {
      yield put(connectFailure(result.error ?? "error.connectFailed"));
    }
  } catch (error) {
    yield put(connectFailure(toErrorMessage(error)));
  }
}

function* connectWithKeySaga(action: ReturnType<typeof connectWithKeyRequest>): SagaIterator {
  try {
    const result = yield call(() => window.pi.connect(action.payload));
    if (result.ok) {
      yield put(connectWithKeySuccess({ provider: action.payload.provider, model: action.payload.model }));
      // Refresh `configured` flags so the composer's model list reflects the
      // provider that just received a key.
      yield put(loadProviders());
    } else {
      yield put(connectWithKeyFailure(result.error ?? "error.connectFailed"));
    }
  } catch (error) {
    yield put(connectWithKeyFailure(toErrorMessage(error)));
  }
}

function* switchModelSaga(action: ReturnType<typeof switchModelRequest>): SagaIterator {
  try {
    const result = yield call(() =>
      window.pi.switchModel(action.payload.provider, action.payload.model),
    );
    if (result.ok) {
      yield put(switchModelSuccess({ provider: action.payload.provider, model: action.payload.model }));
    } else {
      yield put(chatError(result.error ?? "error.operationFailed"));
    }
  } catch (error) {
    yield put(chatError(toErrorMessage(error)));
  }
}

function* setThinkingLevelSaga(action: ReturnType<typeof setThinkingLevelRequest>): SagaIterator {
  try {
    yield call(() => window.pi.setThinkingLevel(action.payload));
    yield put(setThinkingLevelSuccess(action.payload));
  } catch (error) {
    yield put(chatError(toErrorMessage(error)));
  }
}

function* getActiveModelSaga(): SagaIterator {
  try {
    const active: ActiveModelInfo = yield call(() => window.pi.getActiveModel());
    yield put(getActiveModelSuccess(active));
  } catch {
    // Not connected yet; the login flow will populate the selection.
  }
}

function* disconnectSaga(): SagaIterator {
  try {
    yield call(() => window.pi.disconnect());
  } finally {
    // Always flip the gate back to login, even if the main process threw.
    yield put(disconnectSuccess());
  }
}

export function* loginSaga(): SagaIterator {
  yield takeLatest(loadProviders.type, loadProvidersSaga);
  yield takeLatest(connectRequest.type, connectSaga);
  yield takeLatest(connectWithKeyRequest.type, connectWithKeySaga);
  yield takeLatest(switchModelRequest.type, switchModelSaga);
  yield takeLatest(setThinkingLevelRequest.type, setThinkingLevelSaga);
  yield takeLatest(getActiveModelRequest.type, getActiveModelSaga);
  yield takeLatest(disconnectRequest.type, disconnectSaga);
}
