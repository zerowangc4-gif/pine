import { configureStore } from "@reduxjs/toolkit";
import createSagaMiddleware from "redux-saga";
import { chatSlice, loginSlice, workspaceSlice } from "@renderer/features";
import { layoutSlice } from "./layoutSlice";
import { themeSlice } from "./themeSlice";
import { rootSaga } from "./rootSaga";

const sagaMiddleware = createSagaMiddleware();

export const store = configureStore({
  reducer: {
    theme: themeSlice.reducer,
    layout: layoutSlice.reducer,
    login: loginSlice.reducer,
    workspace: workspaceSlice.reducer,
    chat: chatSlice.reducer,
  },
  middleware: (getDefaultMiddleware) => getDefaultMiddleware({ thunk: false }).concat(sagaMiddleware),
});

sagaMiddleware.run(rootSaga);

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
