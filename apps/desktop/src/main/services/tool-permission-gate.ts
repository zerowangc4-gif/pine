import { promises as fs } from "node:fs";
import path from "node:path";
import type { Extension, ToolCallEvent, ToolCallEventResult } from "../core";
import type { ToolPermissionDiff, ToolPermissionDiffHunk } from "@shared/types";

/**
 * Bridge between the in-process tool-permission gate and PineService.
 *
 * `isAllowed` answers whether a tool may run without asking; `request` pauses
 * the agent run until the renderer's permission modal returns a decision.
 */
export interface ToolPermissionRequestPayload {
  toolName: string;
  summary: string;
  diff?: ToolPermissionDiff;
}

export interface ToolPermissionGate {
  isAllowed(toolName: string): boolean;
  request(payload: ToolPermissionRequestPayload): Promise<boolean>;
}

/**
 * One-line description of what a tool call targets. Shell commands are never
 * included here: their content must not reach the permission panel.
 */
function summarizeToolCall(event: ToolCallEvent): string {
  if (event.toolName === "bash" || event.toolName === "powershell") {
    return "";
  }
  const input = event.input as Record<string, unknown>;
  const filePath = typeof input.path === "string" ? input.path : "";
  if (filePath) {
    return filePath;
  }
  const pattern = typeof input.pattern === "string" ? input.pattern : "";
  if (pattern) {
    return pattern;
  }
  return event.toolName;
}

/**
 * Build a reviewable diff for file-modifying tools. `edit` carries its own
 * old/new text; `write` reads the current file so an overwrite shows a real
 * before/after diff instead of every line as an addition.
 */
async function buildDiff(event: ToolCallEvent, cwd: string): Promise<ToolPermissionDiff | undefined> {
  if (event.toolName === "edit") {
    const input = event.input as { path?: string; edits?: ToolPermissionDiffHunk[] };
    if (typeof input.path === "string" && Array.isArray(input.edits) && input.edits.length > 0) {
      return { path: input.path, hunks: input.edits };
    }
  }
  if (event.toolName === "write") {
    const input = event.input as { path?: string; content?: string };
    if (typeof input.path === "string" && typeof input.content === "string") {
      const absolutePath = path.isAbsolute(input.path) ? input.path : path.resolve(cwd, input.path);
      let oldText = "";
      try {
        oldText = await fs.readFile(absolutePath, "utf8");
      } catch {
        // New file: every line in `content` is an addition.
      }
      return { path: input.path, hunks: [{ oldText, newText: input.content }] };
    }
  }
  return undefined;
}

/**
 * Build the inline SDK extension that gates tool execution.
 *
 * The extension registers a `tool_call` handler: allowed tools pass through;
 * anything else waits on a renderer-side permission decision and blocks with a
 * reason when denied. Returning `undefined` means "run the tool".
 */
export function createToolPermissionGateExtension(gate: ToolPermissionGate, cwd: string): Extension {
  const handler = async (...args: unknown[]): Promise<ToolCallEventResult | undefined> => {
    const event = args[0] as ToolCallEvent;
    if (gate.isAllowed(event.toolName)) {
      return undefined;
    }
    const summary = summarizeToolCall(event);
    const diff = await buildDiff(event, cwd);
    const allowed = await gate.request({ toolName: event.toolName, summary, diff });
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
