export const ipcChannels = {
  ready: "app:ready",
} as const;

export interface ElectronApi {
  onReady(listener: (ready: boolean) => void): void;
}
