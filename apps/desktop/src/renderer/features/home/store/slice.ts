import { createSlice, type PayloadAction } from "@reduxjs/toolkit";
import type { State } from "../types/state";

const initialState: State = {
  ready: false,
};

const homeSlice = createSlice({
  name: "home",
  initialState,
  reducers: {
    readyChanged(state, action: PayloadAction<boolean>) {
      state.ready = action.payload;
    },
  },
});

export const { readyChanged } = homeSlice.actions;
export default homeSlice.reducer;
