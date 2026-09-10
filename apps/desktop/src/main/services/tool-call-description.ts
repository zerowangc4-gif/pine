import { SHELL_TOOLS, type ToolPermissionDiff } from "@shared/types";
import { normalizeDiffHunks } from "@shared/utils";

/**
 * Build the chat-visible detail for a tool step. File-modifying tools carry a
 * diff so the user can review exactly what changed. Shell commands are shown
 * as the summary: an invisible command is the bigger safety risk, so the UI
 * renders it collapsed by default with an explicit expand + copy affordance.
 *
 * Pure and side-effect free. Shared by the live event stream (`tool_start`),
 * the permission gate, and the session-reload path so all three produce the
 * exact same detail.
 */
export function describeToolCall(
  toolName: string,
  args: unknown,
): { summary?: string; diff?: ToolPermissionDiff } {
  const input = (args ?? {}) as Record<string, unknown>;
  const filePath = typeof input.path === "string" ? input.path : "";
  const pattern = typeof input.pattern === "string" ? input.pattern : "";

  if (SHELL_TOOLS.includes(toolName)) {
    const command = typeof input.command === "string" ? input.command : "";
    return command ? { summary: command } : {};
  }
  if (toolName === "edit") {
    const hunks = normalizeDiffHunks(input.edits);
    return {
      diff: filePath && hunks ? { path: filePath, hunks } : undefined,
    };
  }
  if (toolName === "write") {
    const content = typeof input.content === "string" ? input.content : "";
    return {
      diff: filePath ? { path: filePath, hunks: [{ oldText: "", newText: content }] } : undefined,
    };
  }
  if (toolName === "grep" || toolName === "find") {
    return { summary: pattern };
  }
  return { summary: filePath || toolName };
}
