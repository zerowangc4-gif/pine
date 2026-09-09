import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { State } from "../types/state";

const initialState: State = {
  models: "",
};

export const loginSlice = createSlice({
  name: "login",
  initialState,
  reducers: {
    setModels(state, action: PayloadAction<string>) {
      state.models = action.payload;
    },
  },
});

export const { setModels } = loginSlice.actions;
