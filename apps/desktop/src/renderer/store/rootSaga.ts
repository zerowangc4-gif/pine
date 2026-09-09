import type { SagaIterator } from "redux-saga";
import { all, fork } from "redux-saga/effects";
import { chatSaga, loginSaga, workspaceSaga } from "@renderer/features";

export function* rootSaga(): SagaIterator {
  yield all([fork(loginSaga), fork(workspaceSaga), fork(chatSaga)]);
}
