import type { SessionInfo, SessionStatsDTO } from "@shared/types";

export interface ToolStep {
  id: string;
  name: string;
  status: "running" | "done" | "error";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  text: string;
  thinking?: string;
  tools?: ToolStep[];
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
}
