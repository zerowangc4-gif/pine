import { promises as fs } from "node:fs";
import path from "node:path";

interface SessionSettingsRecord {
  autoCompaction?: boolean;
}

/**
 * Per-session settings (currently just auto-compaction) live in a sidecar JSON
 * file keyed by session path. The SDK's SettingsManager is created in-memory on
 * every load, so this file is what keeps the flag from resetting to off each
 * time a session is reopened.
 */
export class SessionSettingsStore {
  constructor(private readonly sessionsDir: string) {}

  async loadAutoCompaction(sessionPath: string): Promise<boolean> {
    try {
      const raw = await fs.readFile(this.file(), "utf8");
      const map = JSON.parse(raw) as Record<string, SessionSettingsRecord>;
      return map[sessionPath]?.autoCompaction ?? false;
    } catch {
      // Missing/corrupt settings file: fall back to the default (off).
      return false;
    }
  }

  async saveAutoCompaction(sessionPath: string, enabled: boolean): Promise<void> {
    const file = this.file();
    let map: Record<string, SessionSettingsRecord> = {};
    try {
      const raw = await fs.readFile(file, "utf8");
      map = JSON.parse(raw) as Record<string, SessionSettingsRecord>;
    } catch {
      // First write: no settings file yet.
    }
    map[sessionPath] = { autoCompaction: enabled };
    await fs.mkdir(this.sessionsDir, { recursive: true });
    await fs.writeFile(file, JSON.stringify(map, null, 2), "utf8");
  }

  private file(): string {
    return path.join(this.sessionsDir, "session-settings.json");
  }
}
