/**
 * The configuration draft.
 *
 * The user edits a local draft; nothing reaches the agent until it is applied.
 * `applied` holds the last configuration the server confirmed, so the panel can
 * show what is unsaved and offer a revert.
 *
 * The draft is persisted to `localStorage` and merged over the defaults on load,
 * which means a config written by an older build gains new fields instead of
 * breaking.
 */

import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import { createDefaultConfig, mergeConfig, type AgentConfig, type AgentConfigPatch } from "@pine/protocol";

const STORAGE_KEY = "pine.config.v3";

export interface ConfigState {
	draft: AgentConfig;
	/** Last configuration acknowledged by the sidecar. */
	applied?: AgentConfig;
}

/** Merge a stored draft over the current defaults, tolerating any corruption. */
function loadDraft(): AgentConfig {
	const defaults = createDefaultConfig("");
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return defaults;
		return mergeConfig(defaults, JSON.parse(raw) as AgentConfigPatch);
	} catch {
		return defaults;
	}
}

export function persistDraft(config: AgentConfig): void {
	try {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	} catch {
		// A full or disabled storage must not break the session.
	}
}

const initialState: ConfigState = { draft: loadDraft() };

export const configSlice = createSlice({
	name: "config",
	initialState,
	reducers: {
		/** Local edit. Merged the same way the server merges, so both agree. */
		patchDraft(state, action: PayloadAction<AgentConfigPatch>) {
			state.draft = mergeConfig(state.draft, action.payload);
			persistDraft(state.draft);
		},

		/**
		 * Adopt a server-confirmed configuration.
		 *
		 * The server clamps some values — a non-reasoning model forces the thinking
		 * level to `off`, for instance — so the draft is realigned to what actually
		 * took effect rather than what was asked for.
		 */
		serverConfirmed(state, action: PayloadAction<AgentConfig>) {
			state.applied = action.payload;
			state.draft = action.payload;
			persistDraft(state.draft);
		},

		revertDraft(state) {
			if (!state.applied) return;
			state.draft = state.applied;
			persistDraft(state.draft);
		},
	},
	selectors: {
		selectDraft: (state) => state.draft,
		selectApplied: (state) => state.applied,
		/** Which top-level fields differ from what the server confirmed. */
		selectDirtyFields: (state): string[] => {
			if (!state.applied) return [];
			const applied = state.applied as unknown as Record<string, unknown>;
			const draft = state.draft as unknown as Record<string, unknown>;
			return Object.keys(draft).filter((key) => JSON.stringify(draft[key]) !== JSON.stringify(applied[key]));
		},
	},
});

export const configActions = configSlice.actions;
export const { selectDraft, selectApplied, selectDirtyFields } = configSlice.selectors;
