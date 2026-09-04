/**
 * Buttons.
 *
 * Three variants carry the whole app: `primary` for the one action a view is
 * about, `secondary` for everything else, `ghost` for icon and inline actions.
 * `danger` is the only place colour appears on a control, reserved for
 * destructive confirmations.
 */

import styled, { css } from "styled-components";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";
export type ButtonSize = "sm" | "md";

interface ButtonProps {
	$variant?: ButtonVariant;
	$size?: ButtonSize;
	$fullWidth?: boolean;
}

const variants = {
	primary: css`
		background: ${({ theme }) => theme.colors.accent};
		color: ${({ theme }) => theme.colors.textInverted};
		border-color: ${({ theme }) => theme.colors.accent};

		&:hover:not(:disabled) {
			background: ${({ theme }) => theme.colors.accentHover};
			border-color: ${({ theme }) => theme.colors.accentHover};
		}
	`,
	secondary: css`
		background: ${({ theme }) => theme.colors.surface};
		color: ${({ theme }) => theme.colors.text};
		border-color: ${({ theme }) => theme.colors.border};

		&:hover:not(:disabled) {
			background: ${({ theme }) => theme.colors.hover};
			border-color: ${({ theme }) => theme.colors.borderStrong};
		}
	`,
	ghost: css`
		background: transparent;
		color: ${({ theme }) => theme.colors.textMuted};
		border-color: transparent;

		&:hover:not(:disabled) {
			background: ${({ theme }) => theme.colors.hover};
			color: ${({ theme }) => theme.colors.text};
		}
	`,
	danger: css`
		background: transparent;
		color: ${({ theme }) => theme.colors.danger};
		border-color: ${({ theme }) => theme.colors.border};

		&:hover:not(:disabled) {
			background: ${({ theme }) => theme.colors.dangerSurface};
			border-color: ${({ theme }) => theme.colors.danger};
		}
	`,
} as const;

const sizes = {
	sm: css`
		padding: ${({ theme }) => `${theme.space[1]} ${theme.space[2]}`};
		font-size: ${({ theme }) => theme.fontSize.sm};
		min-height: 24px;
	`,
	md: css`
		padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
		font-size: ${({ theme }) => theme.fontSize.md};
		min-height: 32px;
	`,
} as const;

export const Button = styled.button<ButtonProps>`
	display: inline-flex;
	align-items: center;
	justify-content: center;
	gap: ${({ theme }) => theme.space[2]};
	border: 1px solid transparent;
	border-radius: ${({ theme }) => theme.radius.md};
	font-weight: ${({ theme }) => theme.fontWeight.medium};
	cursor: pointer;
	white-space: nowrap;
	transition:
		background ${({ theme }) => theme.duration.fast},
		border-color ${({ theme }) => theme.duration.fast},
		color ${({ theme }) => theme.duration.fast};

	${({ $size = "md" }) => sizes[$size]}
	${({ $variant = "secondary" }) => variants[$variant]}
	${({ $fullWidth }) =>
		$fullWidth &&
		css`
			width: 100%;
		`}

	&:disabled {
		opacity: 0.45;
		cursor: not-allowed;
	}
`;

/** Square button for a single glyph, sized to align with `Button` `sm`. */
export const IconButton = styled(Button).attrs({ $variant: "ghost" as ButtonVariant })`
	padding: ${({ theme }) => theme.space[1]};
	min-width: 24px;
	min-height: 24px;
	font-size: ${({ theme }) => theme.fontSize.md};
	line-height: 1;
`;

/** Horizontal group of related buttons, on the 4px grid. */
export const ButtonRow = styled.div`
	display: flex;
	align-items: center;
	gap: ${({ theme }) => theme.space[2]};
	flex-wrap: wrap;
`;
