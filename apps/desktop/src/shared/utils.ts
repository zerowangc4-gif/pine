import type { ToolPermissionDiffHunk } from "./types";

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/**
 * Validate a tool-call `edits` payload into a list of diff hunks. Returns
 * undefined when the payload is missing/empty or any entry is malformed, so a
 * changed SDK field shape fails closed (no diff) instead of rendering garbage.
 */
export function normalizeDiffHunks(edits: unknown): ToolPermissionDiffHunk[] | undefined {
  if (!Array.isArray(edits)) {
    return undefined;
  }
  const hunks: ToolPermissionDiffHunk[] = [];
  for (const edit of edits) {
    if (edit == null || typeof edit !== "object") {
      return undefined;
    }
    const { oldText, newText } = edit as Record<string, unknown>;
    if (typeof oldText !== "string" || typeof newText !== "string") {
      return undefined;
    }
    hunks.push({ oldText, newText });
  }
  return hunks.length > 0 ? hunks : undefined;
}
