import type { SagaIterator } from "redux-saga";
import { call, put, select, takeLatest } from "redux-saga/effects";
import type { ProviderInfo } from "@shared/types";
import { toErrorMessage } from "@shared/utils";
import type { RootState } from "@renderer/store";
import type { State } from "../types/state";
import {
  connectFailure,
  connectRequest,
  connectSuccess,
  loadProviders,
  loadProvidersFailure,
  loadProvidersSuccess,
} from "./slice";

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
    } else {
      yield put(connectFailure(result.error ?? "error.connectFailed"));
    }
  } catch (error) {
    yield put(connectFailure(toErrorMessage(error)));
  }
}

export function* loginSaga(): SagaIterator {
  yield takeLatest(loadProviders.type, loadProvidersSaga);
  yield takeLatest(connectRequest.type, connectSaga);
}
