/**
 * Desktop entry point.
 *
 * Provider order matters: the Redux store must wrap `App` so every hook and
 * the ThemeProvider (which itself reads the theme from the store) can see it.
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Provider } from "react-redux";
import { App } from "./App.tsx";
import { store } from "./store/index.ts";

/** E2E hook: dispatch protocol mismatch / inspect Redux without Tauri. */
if (import.meta.env.DEV) {
	(globalThis as unknown as { __pineStore?: typeof store }).__pineStore = store;
}

createRoot(document.getElementById("root")!).render(
	<StrictMode>
		<Provider store={store}>
			<App />
		</Provider>
	</StrictMode>,
);
