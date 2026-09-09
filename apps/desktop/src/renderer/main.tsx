import React from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { ThemedRoot } from "./ThemedRoot";
import { store } from "./store";
import "./i18n";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Provider store={store}>
      <ThemedRoot />
    </Provider>
  </React.StrictMode>,
);
