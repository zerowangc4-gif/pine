/** Returns the last path segment, handling both `/` and `\` separators. */
export function basename(filePath: string): string {
  const parts = filePath.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] ?? filePath;
}
