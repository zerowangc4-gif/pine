import { ipcMain } from "electron";
import { IPC_CHANNELS } from "@shared/ipc";
import type { ConnectInput, ConnectResult, ProviderInfo } from "@shared/types";
import type { PineService } from "../services/pine-service";

export function registerProviderIpc(service: PineService): void {
  ipcMain.handle(IPC_CHANNELS.providersList, (): Promise<ProviderInfo[]> => service.listProviders());

  ipcMain.handle(
    IPC_CHANNELS.connect,
    (_event, input: ConnectInput): Promise<ConnectResult> => service.connect(input),
  );
}
