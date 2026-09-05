/**
 * Load KEY=VALUE pairs from repo-root `.env` into `process.env` (no overwrite).
 */

import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadEnvFile(filename = ".env") {
	const path = join(root, filename);
	if (!existsSync(path)) return false;
	const text = readFileSync(path, "utf8");
	for (const line of text.split(/\r?\n/)) {
		const trimmed = line.trim();
		if (!trimmed || trimmed.startsWith("#")) continue;
		const eq = trimmed.indexOf("=");
		if (eq <= 0) continue;
		const key = trimmed.slice(0, eq).trim();
		let value = trimmed.slice(eq + 1).trim();
		if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
			value = value.slice(1, -1);
		}
		if (process.env[key] === undefined) process.env[key] = value;
	}
	return true;
}

export function requireDeepseekKey() {
	loadEnvFile();
	const key = process.env.DEEPSEEK_API_KEY?.trim();
	if (key) return key;
	console.error("缺少 DEEPSEEK_API_KEY。任选一种方式：");
	console.error("  1) 在 e:\\agents\\pine\\.env 写入：DEEPSEEK_API_KEY=sk-...");
	console.error('  2) PowerShell:  $env:DEEPSEEK_API_KEY="sk-..."; pnpm test:ui');
	console.error("  3) cmd:         set DEEPSEEK_API_KEY=sk-...&& pnpm test:ui");
	process.exit(1);
}
