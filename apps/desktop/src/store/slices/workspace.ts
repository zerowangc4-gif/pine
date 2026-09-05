/**
 * Working-directory picker state.
 *
 * Browsing is served by the sidecar, so the picker works identically in the
 * Vite dev server and inside Tauri, with no native dialog dependency.
 */

import type { DirectoryListing, WorkspaceValidation } from "@pine/protocol";
import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface WorkspaceState {
	pickerOpen: boolean;
	/** The directory currently being browsed, not yet chosen. */
	listing?: DirectoryListing;
	browsing: boolean;
	showHidden: boolean;
	recent: string[];
	/** Validation of the path typed into the picker's input. */
	validation?: WorkspaceValidation;
	switching: boolean;
	error?: string;
}

const initialState: WorkspaceState = {
	pickerOpen: false,
	browsing: false,
	showHidden: false,
	recent: [],
	switching: false,
};

export const workspaceSlice = createSlice({
	name: "workspace",
	initialState,
	reducers: {
		openPicker(state) {
			state.pickerOpen = true;
			delete state.error;
			delete state.validation;
		},

		closePicker(state) {
			state.pickerOpen = false;
			state.browsing = false;
			delete state.error;
		},

		browsing(state) {
			state.browsing = true;
			delete state.error;
		},

		listingReceived(state, action: PayloadAction<DirectoryListing>) {
			state.browsing = false;
			state.listing = action.payload;
		},

		browseFailed(state, action: PayloadAction<string>) {
			state.browsing = false;
			state.error = action.payload;
		},

		toggleHidden(state) {
			state.showHidden = !state.showHidden;
		},

		recentReceived(state, action: PayloadAction<string[]>) {
			state.recent = action.payload;
		},

		validationReceived(state, action: PayloadAction<WorkspaceValidation>) {
			state.validation = action.payload;
		},

		switching(state) {
			state.switching = true;
			delete state.error;
		},

		switched(state) {
			state.switching = false;
			state.pickerOpen = false;
		},

		switchFailed(state, action: PayloadAction<string>) {
			state.switching = false;
			state.error = action.payload;
		},
	},
	selectors: {
		selectPickerOpen: (state) => state.pickerOpen,
		selectListing: (state) => state.listing,
		selectRecentWorkspaces: (state) => state.recent,
		selectWorkspaceValidation: (state) => state.validation,
		selectShowHidden: (state) => state.showHidden,
	},
});

export const workspaceActions = workspaceSlice.actions;
export const { selectPickerOpen, selectListing, selectRecentWorkspaces, selectWorkspaceValidation, selectShowHidden } =
	workspaceSlice.selectors;
