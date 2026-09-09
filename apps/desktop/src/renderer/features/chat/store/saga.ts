import type { SagaIterator } from "redux-saga";
import { call, put, takeLatest } from "redux-saga/effects";
import { toErrorMessage } from "@shared/utils";
import { chatError, sendMessage } from "./slice";

function* sendMessageSaga(action: ReturnType<typeof sendMessage>): SagaIterator {
  try {
    yield call(() => window.pi.sendMessage(action.payload));
  } catch (error) {
    yield put(chatError(toErrorMessage(error)));
  }
}

export function* chatSaga(): SagaIterator {
  yield takeLatest(sendMessage.type, sendMessageSaga);
}
