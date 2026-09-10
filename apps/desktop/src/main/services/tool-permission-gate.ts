import type { Extension, ToolCallEvent, ToolCallEventResult } from "../core";

/**
 * Bridge between the in-process tool-permission gate and PineService.
 *
 * `isAllowed` answers whether a tool may run without asking; `request` pauses
 * the agent run until the renderer's permission modal returns a decision.
 */
export interface ToolPermissionGate {
  isAllowed(toolName: string): boolean;
  request(toolName: string, summary: string): Promise<boolean>;
}

/** Human-readable one-line description of what a tool call would do. */
function summarizeToolCall(event: ToolCallEvent): string {
  const input = event.input as Record<string, unknown>;
  const command = typeof input.command === "string" ? input.command.trim() : "";
  const filePath = typeof input.path === "string" ? input.path : "";
  const pattern = typeof input.pattern === "string" ? input.pattern : "";

  if (event.toolName === "bash" || event.toolName === "powershell") {
    return command || event.toolName;
  }
  if (filePath) {
    if (event.toolName === "edit" && Array.isArray(input.edits)) {
      return `${filePath} (${input.edits.length} edits)`;
    }
    return filePath;
  }
  if (pattern) {
    return pattern;
  }
  return event.toolName;
}

/**
 * Build the inline SDK extension that gates tool execution.
 *
 * The extension registers a `tool_call` handler: allowed tools pass through;
 * anything else waits on a renderer-side permission decision and blocks with a
 * reason when denied. Returning `undefined` means "run the tool".
 */
export function createToolPermissionGateExtension(gate: ToolPermissionGate): Extension {
  const handler = async (...args: unknown[]): Promise<ToolCallEventResult | undefined> => {
    const event = args[0] as ToolCallEvent;
    if (gate.isAllowed(event.toolName)) {
      return undefined;
    }
    const allowed = await gate.request(event.toolName, summarizeToolCall(event));
    return allowed ? undefined : { block: true, reason: "Blocked by user" };
  };

  return {
    path: "<tool-permission-gate>",
    resolvedPath: "<tool-permission-gate>",
    hidden: true,
    sourceInfo: {
      path: "<tool-permission-gate>",
      source: "internal",
      scope: "project",
      origin: "top-level",
    },
    handlers: new Map([["tool_call", [handler]]]),
    tools: new Map(),
    messageRenderers: new Map(),
    commands: new Map(),
    flags: new Map(),
    shortcuts: new Map(),
  };
}
