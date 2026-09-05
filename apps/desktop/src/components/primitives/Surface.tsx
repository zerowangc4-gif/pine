/**
 * Layout and surface primitives.
 *
 * These exist so no feature component writes a raw pixel value: spacing comes
 * from `theme.space`, which is the 4px grid.
 */

import styled, { css } from "styled-components";
import type { SpaceStep } from "../../theme/tokens.ts";

/** Vertical stack with grid-aligned spacing. */
export const Stack = styled.div<{ $gap?: SpaceStep; $align?: "stretch" | "center" | "flex-start" | "flex-end" }>`
	display: flex;
	flex-direction: column;
	gap: ${({ theme, $gap = 3 }) => theme.space[$gap]};
	align-items: ${({ $align = "stretch" }) => $align};
	min-width: 0;
`;

/** Horizontal row with grid-aligned spacing. */
export const Row = styled.div<{
	$gap?: SpaceStep;
	$align?: "center" | "flex-start" | "flex-end" | "baseline";
	$justify?: "flex-start" | "space-between" | "flex-end" | "center";
	$wrap?: boolean;
}>`
	display: flex;
	flex-direction: row;
	gap: ${({ theme, $gap = 2 }) => theme.space[$gap]};
	align-items: ${({ $align = "center" }) => $align};
	justify-content: ${({ $justify = "flex-start" }) => $justify};
	flex-wrap: ${({ $wrap }) => ($wrap ? "wrap" : "nowrap")};
	min-width: 0;
`;

/** Pushes whatever follows it to the far end of a `Row`. */
export const Spacer = styled.div`
	flex: 1 1 auto;
	min-width: 0;
`;

/** Bordered container for grouped content. */
export const Panel = styled.div<{ $padding?: SpaceStep; $tone?: "surface" | "sunken" }>`
	background: ${({ theme, $tone = "surface" }) => ($tone === "sunken" ? theme.colors.sunken : theme.colors.surface)};
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.lg};
	padding: ${({ theme, $padding = 4 }) => theme.space[$padding]};
	min-width: 0;
`;

export const Divider = styled.hr<{ $spacing?: SpaceStep }>`
	border: none;
	border-top: 1px solid ${({ theme }) => theme.colors.border};
	margin: ${({ theme, $spacing = 4 }) => `${theme.space[$spacing]} 0`};
`;

/** Scrollable region that owns its own overflow. */
export const ScrollArea = styled.div<{ $padding?: SpaceStep }>`
	flex: 1 1 auto;
	overflow-y: auto;
	overflow-x: hidden;
	padding: ${({ theme, $padding = 4 }) => theme.space[$padding]};
	min-height: 0;
`;

/** A titled block inside a panel, with a consistent heading treatment. */
export const Section = styled.section`
	display: flex;
	flex-direction: column;
	gap: ${({ theme }) => theme.space[3]};

	& + & {
		margin-top: ${({ theme }) => theme.space[6]};
		padding-top: ${({ theme }) => theme.space[6]};
		border-top: 1px solid ${({ theme }) => theme.colors.border};
	}
`;

export const SectionTitle = styled.h2`
	margin: 0;
	font-size: ${({ theme }) => theme.fontSize.sm};
	font-weight: ${({ theme }) => theme.fontWeight.semibold};
	letter-spacing: 0.06em;
	text-transform: uppercase;
	color: ${({ theme }) => theme.colors.textMuted};
`;

export const Text = styled.span<{
	$size?: "xs" | "sm" | "md" | "lg" | "xl";
	$tone?: "default" | "muted" | "faint" | "danger" | "warning" | "success";
	$weight?: "normal" | "medium" | "semibold";
	$mono?: boolean;
	$truncate?: boolean;
}>`
	font-size: ${({ theme, $size = "md" }) => theme.fontSize[$size]};
	font-weight: ${({ theme, $weight = "normal" }) => theme.fontWeight[$weight]};
	font-family: ${({ theme, $mono }) => ($mono ? theme.font.mono : theme.font.sans)};
	color: ${({ theme, $tone = "default" }) => {
		switch ($tone) {
			case "muted":
				return theme.colors.textMuted;
			case "faint":
				return theme.colors.textFaint;
			case "danger":
				return theme.colors.danger;
			case "warning":
				return theme.colors.warning;
			case "success":
				return theme.colors.success;
			default:
				return theme.colors.text;
		}
	}};
	${({ $truncate }) =>
		$truncate &&
		css`
			overflow: hidden;
			text-overflow: ellipsis;
			white-space: nowrap;
			min-width: 0;
		`}
`;

/** Small status label. Greyscale by default; tones are for real signals only. */
export const Badge = styled.span<{ $tone?: "neutral" | "danger" | "warning" | "success" | "accent" }>`
	display: inline-flex;
	align-items: center;
	gap: ${({ theme }) => theme.space[1]};
	padding: ${({ theme }) => `0 ${theme.space[2]}`};
	height: 20px;
	border-radius: ${({ theme }) => theme.radius.pill};
	border: 1px solid ${({ theme }) => theme.colors.border};
	font-size: ${({ theme }) => theme.fontSize.xs};
	font-weight: ${({ theme }) => theme.fontWeight.medium};
	white-space: nowrap;

	${({ theme, $tone = "neutral" }) => {
		switch ($tone) {
			case "danger":
				return css`
					background: ${theme.colors.dangerSurface};
					border-color: ${theme.colors.danger};
					color: ${theme.colors.danger};
				`;
			case "warning":
				return css`
					background: ${theme.colors.warningSurface};
					border-color: ${theme.colors.warning};
					color: ${theme.colors.warning};
				`;
			case "success":
				return css`
					color: ${theme.colors.success};
					border-color: ${theme.colors.success};
				`;
			case "accent":
				return css`
					background: ${theme.colors.accent};
					border-color: ${theme.colors.accent};
					color: ${theme.colors.textInverted};
				`;
			default:
				return css`
					background: ${theme.colors.sunken};
					color: ${theme.colors.textMuted};
				`;
		}
	}}
`;

/** Monospace block for code, tool output and JSON. */
export const Code = styled.pre<{ $maxHeight?: string }>`
	margin: 0;
	padding: ${({ theme }) => theme.space[3]};
	background: ${({ theme }) => theme.colors.sunken};
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
	font-family: ${({ theme }) => theme.font.mono};
	font-size: ${({ theme }) => theme.fontSize.sm};
	line-height: ${({ theme }) => theme.lineHeight.normal};
	color: ${({ theme }) => theme.colors.text};
	overflow: auto;
	max-height: ${({ $maxHeight = "320px" }) => $maxHeight};
	white-space: pre-wrap;
	word-break: break-word;
`;

/** Centred placeholder for an empty list or pane. */
export const EmptyState = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	justify-content: center;
	gap: ${({ theme }) => theme.space[2]};
	padding: ${({ theme }) => theme.space[12]} ${({ theme }) => theme.space[6]};
	text-align: center;
	color: ${({ theme }) => theme.colors.textFaint};
	font-size: ${({ theme }) => theme.fontSize.sm};
`;
