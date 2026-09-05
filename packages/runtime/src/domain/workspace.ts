/**
 * Workspace root resolution, validation and browsing.
 *
 * The workspace is the directory the file and shell tools operate in. It is
 * chosen per session and can be switched while the session is alive, so every
 * path the user supplies passes through `resolveWorkspace` first and every
 * switch is gated by `validateWorkspace`.
 */

import { constants } from "node:fs";
import { access, readdir, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, isAbsolute, join, normalize, resolve } from "node:path";
import type { DirectoryEntry, DirectoryListing, WorkspaceValidation } from "@pine/protocol";

/** Directories that are never a useful workspace root, so the picker hides them. */
const NOISE_DIRECTORIES = new Set([
	"node_modules",
	".git",
	".svn",
	".hg",
	"dist",
	"build",
	"target",
	".next",
	".turbo",
	".cache",
	"__pycache__",
	".venv",
	"venv",
]);

/**
 * Turn user input into an absolute, normalized path.
 *
 * Handles `~`, relative paths (against `base`) and trailing separators. Does
 * not touch the filesystem, so it is safe to call on paths that do not exist.
 */
export function resolveWorkspace(input: string | undefined, base: string): string {
	const raw = (input ?? "").trim();
	if (!raw) return resolve(base);

	if (raw === "~") return homedir();
	if (raw.startsWith("~/") || raw.startsWith("~\\")) {
		return resolve(join(homedir(), raw.slice(2)));
	}

	return isAbsolute(raw) ? normalize(resolve(raw)) : resolve(base, raw);
}

/** Inspect a candidate workspace and describe why it can or cannot be used. */
export async function validateWorkspace(input: string, base: string): Promise<WorkspaceValidation> {
	const path = resolveWorkspace(input, base);

	let stats;
	try {
		stats = await stat(path);
	} catch {
		return { path, exists: false, isDirectory: false, writable: false, problem: "Directory does not exist" };
	}

	if (!stats.isDirectory()) {
		return { path, exists: true, isDirectory: false, writable: false, problem: "Path is a file, not a directory" };
	}

	// Write access is advisory: a read-only workspace still works for the read
	// tool, so this surfaces as a warning in the UI rather than a hard block.
	const writable = await access(path, constants.W_OK).then(
		() => true,
		() => false,
	);

	return {
		path,
		exists: true,
		isDirectory: true,
		writable,
		...(writable ? {} : { problem: "Directory is not writable; write, edit and bash may fail" }),
	};
}

/** True when a directory should be hidden from the picker by default. */
function isHidden(name: string): boolean {
	return name.startsWith(".") || NOISE_DIRECTORIES.has(name);
}

/**
 * List one level of the filesystem for the workspace picker.
 *
 * Returns directories only, plus a file count that hints whether the directory
 * holds an actual project. Unreadable children are skipped rather than failing
 * the whole listing.
 */
export async function browseDirectory(
	input: string | undefined,
	base: string,
	includeHidden = false,
): Promise<DirectoryListing> {
	const path = resolveWorkspace(input, base);
	const entries = await readdir(path, { withFileTypes: true });

	const directories: DirectoryEntry[] = [];
	let fileCount = 0;

	for (const entry of entries) {
		if (entry.isDirectory()) {
			const hidden = isHidden(entry.name);
			if (hidden && !includeHidden) continue;
			directories.push({ name: entry.name, path: join(path, entry.name), hidden });
		} else if (entry.isFile()) {
			fileCount += 1;
		}
	}

	directories.sort((a, b) => a.name.localeCompare(b.name));

	const parent = dirname(path);
	return {
		path,
		// `dirname` of a filesystem root returns the root itself; that is the
		// signal that there is nowhere further up to go.
		...(parent !== path ? { parent } : {}),
		directories,
		fileCount,
	};
}
