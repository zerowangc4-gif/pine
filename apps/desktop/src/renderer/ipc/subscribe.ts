import { readyChanged } from "@/renderer/features/home/store/slice";
import type { AppDispatch } from "@/renderer/store";

export function subscribe(dispatch: AppDispatch): void {
  window.electronApi.onReady(ready => {
    dispatch(readyChanged(ready));
  });
}
