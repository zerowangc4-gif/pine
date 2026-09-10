import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Whether an absolute `target` path sits inside `root` (also absolute).
 *
 * Shared by the workspace file guard and the session-file guard so every
 * IPC-bound filesystem path is confined to its owning directory. The check is
 * lexical after `path.resolve`, so `..` traversal cannot escape `root`; pair it
 * with `resolveExistingWithinDir` (realpath) to also block symlink escapes.
 */
export function isPathWithin(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

/**
 * Resolve a path that must already exist inside `dir`. Real-path comparison
 * blocks a symlink inside `dir` pointing outside it, and the directory itself
 * (`real === dirReal`) is rejected too. Throws `notFoundError` when `dir` or
 * the target is missing, escapes, or is the directory itself.
 */
export async function resolveExistingWithinDir(
  dir: string,
  target: string,
  notFoundError: string,
): Promise<string> {
  const dirReal = await fs.realpath(dir).catch(() => "");
  if (!dirReal) {
    throw new Error(notFoundError);
  }
  const resolved = path.resolve(target);
  const real = await fs.realpath(resolved).catch(() => "");
  if (!real || real === dirReal || !isPathWithin(dirReal, real)) {
    throw new Error(notFoundError);
  }
  return resolved;
}
