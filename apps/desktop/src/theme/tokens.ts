/**
 * Design tokens.
 *
 * Two rules are enforced here rather than left to each component:
 *
 *  - **Spacing** is a strict 4px grid. `space` is the only source of margins,
 *    paddings and gaps, and every value is a multiple of 4.
 *  - **Type** is a proportional scale, each step roughly 1.2x the previous, so
 *    sizes stay related instead of being picked ad hoc.
 */

/** 4px grid. The key is the multiplier, so `space[4]` is 16px. */
export const space = {
	0: "0",
	1: "4px",
	2: "8px",
	3: "12px",
	4: "16px",
	5: "20px",
	6: "24px",
	8: "32px",
	10: "40px",
	12: "48px",
	16: "64px",
} as const;

export type SpaceStep = keyof typeof space;

/**
 * Type scale, ~1.2x per step, anchored at 13px for dense tool UI.
 *
 * `xs` is for metadata and counters, `sm` for labels, `md` for body copy and
 * inputs, `lg` upward for headings.
 */
export const fontSize = {
	xs: "11px",
	sm: "12px",
	md: "13px",
	lg: "16px",
	xl: "19px",
	xxl: "23px",
} as const;

export const lineHeight = {
	tight: 1.25,
	normal: 1.5,
	relaxed: 1.7,
} as const;

export const fontWeight = {
	normal: 400,
	medium: 500,
	semibold: 600,
} as const;

export const font = {
	sans: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Noto Sans SC", "PingFang SC", "Microsoft YaHei", Roboto, sans-serif',
	mono: '"SF Mono", "Cascadia Code", Consolas, "Liberation Mono", Menlo, monospace',
} as const;

/** Corner radii, also on the 4px grid apart from the hairline `sm`. */
export const radius = {
	sm: "2px",
	md: "4px",
	lg: "8px",
	pill: "999px",
} as const;

export const duration = {
	fast: "120ms",
	normal: "200ms",
} as const;

/** Fixed layout measurements, so the shell and its panels agree. */
export const layout = {
	sidebarWidth: "320px",
	inspectorWidth: "380px",
	headerHeight: "48px",
	statusBarHeight: "28px",
	maxTranscriptWidth: "880px",
} as const;

export const zIndex = {
	base: 0,
	sticky: 10,
	overlay: 100,
	modal: 200,
} as const;
