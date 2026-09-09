import { AppDispatch } from "../store";
import { setModels } from "@renderer/features";
export function subscribe(dispatch: AppDispatch) {
  window.pi.loadConfig((value: string) => {
    dispatch(setModels(value));
  });
}
