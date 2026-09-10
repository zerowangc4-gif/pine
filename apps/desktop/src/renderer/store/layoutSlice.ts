import { createSlice, type PayloadAction } from "@reduxjs/toolkit";

export interface LayoutState {
  /** Width of the left sidebar (file explorer + sessions) in pixels. */
  sidebarWidth: number;
  /** Whether the sidebar is visible, or collapsed for a fullscreen chat/editor. */
  sidebarVisible: boolean;
}

const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 640;
const SIDEBAR_DEFAULT_WIDTH = 264;

const initialState: LayoutState = {
  sidebarWidth: SIDEBAR_DEFAULT_WIDTH,
  sidebarVisible: true,
};

export const layoutSlice = createSlice({
  name: "layout",
  initialState,
  reducers: {
    setSidebarWidth(state, action: PayloadAction<number>) {
      state.sidebarWidth = clampSidebarWidth(action.payload);
    },
    toggleSidebar(state) {
      state.sidebarVisible = !state.sidebarVisible;
    },
  },
});

function clampSidebarWidth(width: number): number {
  return Math.min(SIDEBAR_MAX_WIDTH, Math.max(SIDEBAR_MIN_WIDTH, Math.round(width)));
}

export const { setSidebarWidth, toggleSidebar } = layoutSlice.actions;
