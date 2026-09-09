/** Returns the last path segment, handling both `/` and `\` separators. */
export function basename(filePath: string): string {
  const parts = filePath.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}

function trimSeparators(filePath: string): string {
  return filePath.replace(/[\\/]+$/, "");
}

/** Returns `target` expressed relative to `root`, handling `/` and `\`. */
export function relativePath(root: string, target: string): string {
  const normalizedRoot = trimSeparators(root);
  if (target === root || target === normalizedRoot) {
    return basename(normalizedRoot);
  }
  if (target.startsWith(`${normalizedRoot}/`) || target.startsWith(`${normalizedRoot}\\`)) {
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
  return child.startsWith(`${normalizedBase}/`) || child.startsWith(`${normalizedBase}\\`);
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
  if (target.startsWith(`${normalizedBase}/`) || target.startsWith(`${normalizedBase}\\`)) {
    return newBase + target.slice(normalizedBase.length);
  }
  return target;
}
