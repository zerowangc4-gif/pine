/**
 * Global reset and the handful of element defaults worth setting once.
 *
 * Everything else is scoped to a component; there is no stylesheet to keep in
 * sync with the markup.
 */

import { createGlobalStyle } from "styled-components";

export const GlobalStyle = createGlobalStyle`
	*, *::before, *::after {
		box-sizing: border-box;
	}

	html, body, #root {
		height: 100%;
		margin: 0;
	}

	body {
		background: ${({ theme }) => theme.colors.background};
		color: ${({ theme }) => theme.colors.text};
		font-family: ${({ theme }) => theme.font.sans};
		font-size: ${({ theme }) => theme.fontSize.md};
		line-height: ${({ theme }) => theme.lineHeight.normal};
		/* The window chrome is ours; the app scrolls its own panes. */
		overflow: hidden;
		-webkit-font-smoothing: antialiased;
	}

	button, input, textarea, select {
		font: inherit;
		color: inherit;
	}

	/* One focus treatment everywhere, and only for keyboard users. */
	:focus-visible {
		outline: 2px solid ${({ theme }) => theme.colors.focus};
		outline-offset: 1px;
	}
	:focus:not(:focus-visible) {
		outline: none;
	}

	/* Thin, greyscale scrollbars that match whichever theme is active. */
	::-webkit-scrollbar {
		width: 8px;
		height: 8px;
	}
	::-webkit-scrollbar-track {
		background: transparent;
	}
	::-webkit-scrollbar-thumb {
		background: ${({ theme }) => theme.colors.borderStrong};
		border-radius: ${({ theme }) => theme.radius.pill};
	}
	::-webkit-scrollbar-thumb:hover {
		background: ${({ theme }) => theme.colors.textFaint};
	}

	::selection {
		background: ${({ theme }) => theme.colors.accent};
		color: ${({ theme }) => theme.colors.textInverted};
	}

	code, pre, kbd {
		font-family: ${({ theme }) => theme.font.mono};
		font-size: ${({ theme }) => theme.fontSize.sm};
	}
`;
