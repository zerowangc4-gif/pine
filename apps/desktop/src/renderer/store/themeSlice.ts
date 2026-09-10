import { createSlice } from "@reduxjs/toolkit";
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
    toggleTheme(state) {
      state.name = state.name === "dark" ? "light" : "dark";
    },
  },
});

export const { toggleTheme } = themeSlice.actions;
