import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type {
  ActiveModelInfo,
  ConnectInput,
  ConnectResult,
  ProviderInfo,
  ThinkingLevel,
} from "@shared/types";
import type { PineService } from "../services/pine-service";

export function registerProviderIpc(service: PineService): void {
  ipcMain.handle(IPC_CHANNELS.providersList, (): Promise<ProviderInfo[]> => service.listProviders());

  ipcMain.handle(
    IPC_CHANNELS.connect,
    (_event, input: ConnectInput): Promise<ConnectResult> => service.connect(input),
  );

  ipcMain.handle(
    IPC_CHANNELS.modelSwitch,
    (_event, provider: string, model: string): Promise<ConnectResult> =>
      service.switchModel(provider, model),
  );

  ipcMain.handle(
    IPC_CHANNELS.modelThinkingLevel,
    (_event, level: ThinkingLevel): Promise<void> => service.setThinkingLevel(level),
  );

  ipcMain.handle(IPC_CHANNELS.modelActive, (): ActiveModelInfo => service.getActiveModel());
}
