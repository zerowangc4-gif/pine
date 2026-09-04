/**
 * The black-and-white dual theme.
 *
 * The palette is deliberately greyscale: hierarchy comes from contrast, border
 * weight and type scale, not from colour. The one exception is a restrained
 * semantic pair — a blocked shell command or a provider error has to be
 * unmistakable, and greyscale alone cannot carry that.
 *
 * Both themes expose an identical key set, so a component never needs to know
 * which one is active.
 */

import { duration, font, fontSize, fontWeight, layout, lineHeight, radius, space, zIndex } from "./tokens.ts";

export type ThemeName = "light" | "dark";

export interface ThemeColors {
	/** Page background. */
	background: string;
	/** Raised areas: panels, cards, the composer. */
	surface: string;
	/** Recessed areas: code blocks, tool output, inputs. */
	sunken: string;
	/** Hover and pressed states on interactive surfaces. */
	hover: string;
	active: string;

	/** Primary body text. */
	text: string;
	/** Labels and metadata. */
	textMuted: string;
	/** Placeholders and disabled text. */
	textFaint: string;
	/** Text on top of `accent`. */
	textInverted: string;

	border: string;
	borderStrong: string;
	/** Keyboard focus ring. */
	focus: string;

	/** Solid fill for the primary action; the inverse of the background. */
	accent: string;
	accentHover: string;

	danger: string;
	dangerSurface: string;
	warning: string;
	warningSurface: string;
	success: string;
}

export interface AppTheme {
	name: ThemeName;
	colors: ThemeColors;
	space: typeof space;
	fontSize: typeof fontSize;
	lineHeight: typeof lineHeight;
	fontWeight: typeof fontWeight;
	font: typeof font;
	radius: typeof radius;
	duration: typeof duration;
	layout: typeof layout;
	zIndex: typeof zIndex;
}

const shared = { space, fontSize, lineHeight, fontWeight, font, radius, duration, layout, zIndex };

export const lightTheme: AppTheme = {
	...shared,
	name: "light",
	colors: {
		background: "#ffffff",
		surface: "#fbfbfb",
		sunken: "#f4f4f4",
		hover: "#f0f0f0",
		active: "#e6e6e6",

		text: "#0d0d0d",
		textMuted: "#5c5c5c",
		textFaint: "#9b9b9b",
		textInverted: "#ffffff",

		border: "#e4e4e4",
		borderStrong: "#c8c8c8",
		focus: "#0d0d0d",

		accent: "#0d0d0d",
		accentHover: "#2b2b2b",

		danger: "#a32020",
		dangerSurface: "#fdf2f2",
		warning: "#8a5a00",
		warningSurface: "#fdf8ef",
		success: "#1f6f3d",
	},
};

export const darkTheme: AppTheme = {
	...shared,
	name: "dark",
	colors: {
		background: "#0a0a0a",
		surface: "#121212",
		sunken: "#1a1a1a",
		hover: "#1f1f1f",
		active: "#2a2a2a",

		text: "#f2f2f2",
		textMuted: "#a0a0a0",
		textFaint: "#6b6b6b",
		textInverted: "#0a0a0a",

		border: "#262626",
		borderStrong: "#3d3d3d",
		focus: "#f2f2f2",

		accent: "#f2f2f2",
		accentHover: "#d6d6d6",

		danger: "#f08a8a",
		dangerSurface: "#241414",
		warning: "#e0b464",
		warningSurface: "#241f14",
		success: "#7ec98f",
	},
};

export const themes: Record<ThemeName, AppTheme> = { light: lightTheme, dark: darkTheme };
