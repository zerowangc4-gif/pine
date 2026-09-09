import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { ThemeName } from "@renderer/theme";

export interface ThemeState {
  name: ThemeName;
}

const initialState: ThemeState = {
  name: "dark",
};

export const themeSlice = createSlice({
  name: "theme",
  initialState,
  reducers: {
    setTheme(state, action: PayloadAction<ThemeName>) {
      state.name = action.payload;
    },
    toggleTheme(state) {
      state.name = state.name === "dark" ? "light" : "dark";
    },
  },
});

export const { setTheme, toggleTheme } = themeSlice.actions;
