/**
 * View preferences: theme, language and panel layout.
 *
 * Everything here is persisted, because these are choices a user makes once and
 * expects to survive a restart. They are kept out of the other slices so that
 * clearing a session never disturbs the user's chrome.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { detectLocale, type Locale } from "../../i18n/index.ts";
import type { ThemeName } from "../../theme/themes.ts";

export type InspectorTab = "state" | "resources" | "sessions" | "events" | "payloads";

export interface UiState {
	theme: ThemeName;
	locale: Locale;
	configPanelOpen: boolean;
	inspectorOpen: boolean;
	inspectorTab: InspectorTab;
}

const STORAGE_KEY = "pine.ui.v1";

function loadPreferences(): UiState {
	const defaults: UiState = {
		// Follow the OS on first run; the toggle overrides it from then on.
		theme:
			typeof matchMedia === "function" && matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
		locale: detectLocale(),
		configPanelOpen: true,
		inspectorOpen: false,
		inspectorTab: "state",
	};
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		return raw ? { ...defaults, ...(JSON.parse(raw) as Partial<UiState>) } : defaults;
	} catch {
		return defaults;
	}
}

function persist(state: UiState): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
	} catch {
		// Preferences are a convenience; failing to store them is not an error.
	}
}

export const uiSlice = createSlice({
	name: "ui",
	initialState: loadPreferences(),
	reducers: {
		toggleTheme(state) {
			state.theme = state.theme === "dark" ? "light" : "dark";
			persist(state);
		},

		setLocale(state, action: PayloadAction<Locale>) {
			state.locale = action.payload;
			persist(state);
		},

		toggleConfigPanel(state) {
			state.configPanelOpen = !state.configPanelOpen;
			persist(state);
		},

		toggleInspector(state) {
			state.inspectorOpen = !state.inspectorOpen;
			persist(state);
		},

		setInspectorTab(state, action: PayloadAction<InspectorTab>) {
			state.inspectorTab = action.payload;
			// Choosing a tab implies wanting to see it.
			state.inspectorOpen = true;
			persist(state);
		},
	},
	selectors: {
		selectTheme: (state) => state.theme,
		selectLocale: (state) => state.locale,
		selectConfigPanelOpen: (state) => state.configPanelOpen,
		selectInspectorOpen: (state) => state.inspectorOpen,
		selectInspectorTab: (state) => state.inspectorTab,
	},
});

export const uiActions = uiSlice.actions;
export const { selectTheme, selectLocale, selectConfigPanelOpen, selectInspectorOpen, selectInspectorTab } =
	uiSlice.selectors;
