/** Returns the last path segment, handling both `/` and `\` separators. */
export function basename(filePath: string): string {
  const parts = filePath.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

function trimSeparators(filePath: string): string {
  return filePath.replace(/[\\/]+$/, "");
}

/**
 * Windows and (by default) macOS filesystems are case-insensitive. The
 * authoritative containment check lives in the main process; these renderer
 * helpers only drive tree cleanup/remapping, where a case-only mismatch must
 * not leave stale nodes behind.
 */
function isCaseInsensitiveFs(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  return /win|mac/i.test(navigator.platform ?? "");
}

function normalizeForCompare(filePath: string): string {
  return isCaseInsensitiveFs() ? filePath.toLowerCase() : filePath;
}

/** Returns `target` expressed relative to `root`, handling `/` and `\`. */
export function relativePath(root: string, target: string): string {
  const normalizedRoot = trimSeparators(root);
  if (target === root || target === normalizedRoot) {
    return basename(normalizedRoot);
  }
  const rootKey = normalizeForCompare(normalizedRoot);
  const targetKey = normalizeForCompare(target);
  if (targetKey === rootKey) {
    return basename(normalizedRoot);
  }
  if (targetKey.startsWith(`${rootKey}/`) || targetKey.startsWith(`${rootKey}\\`)) {
    return target.slice(normalizedRoot.length + 1);
  }
  return basename(target);
}

/** Returns the parent directory of `filePath`, handling `/` and `\`. */
export function dirname(filePath: string): string {
  const trimmed = trimSeparators(filePath);
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index <= 0) {
    return trimmed;
  }
  // Preserve the trailing separator of Windows drive roots like `C:\`.
  if (trimmed[index - 1] === ":") {
    return trimmed.slice(0, index + 1);
  }
  return trimmed.slice(0, index);
}

/**
 * Returns `true` when `child` is `base` itself or lives anywhere below it.
 * Handles both `/` and `\` separators so it works on any platform.
 */
export function isPathUnder(child: string, base: string): boolean {
  const normalizedBase = trimSeparators(base);
  if (child === base || child === normalizedBase) {
    return true;
  }
  const baseKey = normalizeForCompare(normalizedBase);
  const childKey = normalizeForCompare(child);
  return childKey === baseKey || childKey.startsWith(`${baseKey}/`) || childKey.startsWith(`${baseKey}\\`);
}

/**
 * Rewrites `target` so that the `oldBase` prefix becomes `newBase`. Any path
 * outside `oldBase` is returned unchanged.
 */
export function remapPath(target: string, oldBase: string, newBase: string): string {
  const normalizedBase = trimSeparators(oldBase);
  if (target === oldBase || target === normalizedBase) {
    return newBase;
  }
  const baseKey = normalizeForCompare(normalizedBase);
  const targetKey = normalizeForCompare(target);
  if (targetKey === baseKey) {
    return newBase;
  }
  if (targetKey.startsWith(`${baseKey}/`) || targetKey.startsWith(`${baseKey}\\`)) {
    return newBase + target.slice(normalizedBase.length);
  }
  return target;
}
