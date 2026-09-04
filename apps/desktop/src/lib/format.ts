/**
 * Display helpers.
 *
 * Pure functions only, so they can be used from render without care. Anything
 * locale sensitive takes the locale explicitly rather than reading a global.
 */

import type { Locale } from "../i18n/index.ts";

/** Compact token counts: 1234 -> "1.2k", 1234567 -> "1.2M". */
export function formatTokens(value: number): string {
	if (!Number.isFinite(value)) return "0";
	if (Math.abs(value) < 1000) return String(Math.round(value));
	if (Math.abs(value) < 1_000_000) return `${(value / 1000).toFixed(1)}k`;
	return `${(value / 1_000_000).toFixed(1)}M`;
}

/** Costs are often fractions of a cent, so the precision scales with the value. */
export function formatCost(value: number): string {
	if (!Number.isFinite(value) || value === 0) return "$0";
	if (value < 0.01) return `$${value.toFixed(4)}`;
	if (value < 1) return `$${value.toFixed(3)}`;
	return `$${value.toFixed(2)}`;
}

export function formatPercent(fraction: number): string {
	return `${Math.round(Math.max(0, Math.min(1, fraction)) * 100)}%`;
}

export function formatBytes(value: number): string {
	if (value < 1024) return `${value} B`;
	if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
	return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(timestamp: number, locale: Locale): string {
	return new Date(timestamp).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function formatDateTime(timestamp: number, locale: Locale): string {
	return new Date(timestamp).toLocaleString(locale, {
		month: "short",
		day: "numeric",
		hour: "2-digit",
		minute: "2-digit",
	});
}

/** Pretty JSON that never throws, for inspector panes. */
export function formatJson(value: unknown): string {
	try {
		return JSON.stringify(value, null, 2) ?? String(value);
	} catch {
		return String(value);
	}
}

/** Single-line JSON for tool-call argument previews. */
export function formatArgsInline(value: unknown, maxLength = 120): string {
	if (value === undefined || value === null) return "";
	let text: string;
	try {
		text = typeof value === "string" ? value : (JSON.stringify(value) ?? "");
	} catch {
		text = String(value);
	}
	return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

/** Last two path segments, which is usually enough to identify a directory. */
export function shortenPath(path: string, segments = 2): string {
	const parts = path.split(/[\\/]/).filter(Boolean);
	if (parts.length <= segments) return path;
	return `…${path.includes("\\") ? "\\" : "/"}${parts.slice(-segments).join(path.includes("\\") ? "\\" : "/")}`;
}

/** Trailing directory name, for tabs and headings. */
export function basename(path: string): string {
	const parts = path.split(/[\\/]/).filter(Boolean);
	return parts[parts.length - 1] ?? path;
}
