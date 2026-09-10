import type { ChatImage, MessageUsage, SessionInfo, SessionSettingsDTO, SessionStatsDTO, ToolPermissionDiff, ToolPermissionRequest } from "@shared/types";

export interface ToolStep {
  id: string;
  name: string;
  status: "running" | "done" | "error";
  summary?: string;
  diff?: ToolPermissionDiff;
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  tools?: ToolStep[];
  images?: ChatImage[];
  usage?: MessageUsage;
  streaming?: boolean;
}

export interface State {
  messages: ChatMessage[];
  streaming: boolean;
  error?: string;
  sessions: SessionInfo[];
  sessionsLoading: boolean;
  activeSessionPath?: string;
  sessionError?: string;
  sessionStats?: SessionStatsDTO;
  sessionSettings?: SessionSettingsDTO;
  activeTools: string[];
  pendingPermissions: ToolPermissionRequest[];
}
