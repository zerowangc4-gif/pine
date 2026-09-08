import { configureStore } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import homeReducer from "@/renderer/features/home/store/slice";
import { rootSaga } from "./rootSaga";

const sagaMiddleware = createSagaMiddleware();

export const store = configureStore({
  reducer: {
    home: homeReducer,
  },
  middleware: getDefaultMiddleware => getDefaultMiddleware({ thunk: false }).concat(sagaMiddleware),
});

sagaMiddleware.run(rootSaga);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
