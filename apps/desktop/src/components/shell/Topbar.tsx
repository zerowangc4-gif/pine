/**
 * Top bar: brand, connection status, session controls, theme and language.
 *
 * Kept deliberately thin — usage numbers and model id are ambient context, not
 * primary controls. Everything that configures the agent lives in the left
 * panel; everything that inspects a run lives on the right.
 */

import styled from "styled-components";
import { RUNTIME_PORT } from "@pine/protocol";
import { LOCALE_LABELS, LOCALES, type Locale } from "../../i18n/index.ts";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { formatCost, formatTokens } from "../../lib/format.ts";
import { openSession, startNewSession, closeSession, resetTranscript } from "../../store/actions/session.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { selectProtocolMismatch } from "../../store/slices/connection.ts";
import { selectDraft } from "../../store/slices/config.ts";
import { selectIsRunning, selectSessionId, selectSnapshot } from "../../store/slices/session.ts";
import { selectLocale, selectTheme, uiActions } from "../../store/slices/ui.ts";
import { Button, IconButton } from "../primitives/Button.tsx";
import { Badge, Spacer, Text } from "../primitives/Surface.tsx";
import { socket } from "../../socket/client.ts";

const Bar = styled.header`
	display: flex;
	align-items: center;
	gap: ${({ theme }) => theme.space[3]};
	flex: 0 0 auto;
	height: ${({ theme }) => theme.layout.headerHeight};
	padding: 0 ${({ theme }) => theme.space[3]};
	border-bottom: 1px solid ${({ theme }) => theme.colors.border};
	background: ${({ theme }) => theme.colors.surface};
	min-width: 0;
`;

const Brand = styled(Text)`
	font-size: ${({ theme }) => theme.fontSize.lg};
	font-weight: ${({ theme }) => theme.fontWeight.semibold};
	letter-spacing: -0.02em;
`;

const Select = styled.select`
	height: 28px;
	padding: 0 ${({ theme }) => theme.space[2]};
	background: ${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
	color: ${({ theme }) => theme.colors.text};
	font-size: ${({ theme }) => theme.fontSize.sm};
`;

export function Topbar(props: {
	onToggleConfig: () => void;
	onToggleInspector: () => void;
}) {
	const t = useTranslate();
	const dispatch = useAppDispatch();

	const status = useAppSelector((state) => state.connection.status);
	const recovered = useAppSelector((state) => state.connection.recovered);
	const mismatch = useAppSelector(selectProtocolMismatch);
	const draft = useAppSelector(selectDraft);
	const snapshot = useAppSelector(selectSnapshot);
	const sessionId = useAppSelector(selectSessionId);
	const running = useAppSelector(selectIsRunning);
	const theme = useAppSelector(selectTheme);
	const locale = useAppSelector(selectLocale);
	const opening = useAppSelector((state) => state.session.opening);

	const statusTone = status === "connected" ? "success" : status === "connecting" ? "warning" : "danger";
	const statusLabel =
		status === "connected"
			? recovered
				? t("connection.recovered")
				: t("connection.connected")
			: status === "connecting"
				? t("connection.connecting")
				: t("connection.disconnected");

	return (
		<Bar>
			<IconButton type="button" aria-label={t("app.panel.config")} onClick={props.onToggleConfig}>
				☰
			</IconButton>

			<Brand as="span">{t("app.title")}</Brand>

			<Badge $tone={statusTone}>{statusLabel}</Badge>

			{mismatch ? (
				<Text $size="xs" $tone="danger">
					{t("connection.protocolMismatch", { server: mismatch.server, client: mismatch.client })}
				</Text>
			) : null}

			{status !== "connected" ? (
				<>
					<Text $size="xs" $tone="muted">
						{t("connection.waiting", { port: RUNTIME_PORT })}
					</Text>
					<Button
						type="button"
						$size="sm"
						onClick={() => {
							if (!socket.connected) socket.connect();
						}}
					>
						{t("connection.retry")}
					</Button>
				</>
			) : null}

			{draft.model.modelId ? (
				<Text $size="xs" $tone="muted" $truncate>
					{draft.model.displayName || draft.model.modelId}
					{draft.thinkingLevel !== "off" ? ` · ${draft.thinkingLevel}` : ""}
				</Text>
			) : null}

			<Spacer />

			{snapshot ? (
				<Text $size="xs" $tone="muted">
					{formatTokens(snapshot.contextTokens)}/{formatTokens(snapshot.contextWindow)} ·{" "}
					{formatTokens(snapshot.usage.totalTokens)} · {formatCost(snapshot.usage.cost)}
					{running ? " · …" : ""}
				</Text>
			) : null}

			<Select
				aria-label={t("app.language")}
				value={locale}
				onChange={(event) => dispatch(uiActions.setLocale(event.target.value as Locale))}
			>
				{LOCALES.map((entry) => (
					<option key={entry} value={entry}>
						{LOCALE_LABELS[entry]}
					</option>
				))}
			</Select>

			<IconButton
				type="button"
				aria-label={theme === "dark" ? t("app.theme.toLight") : t("app.theme.toDark")}
				onClick={() => dispatch(uiActions.toggleTheme())}
			>
				{theme === "dark" ? "☀" : "☾"}
			</IconButton>

			{sessionId ? (
				<>
					<Button
						type="button"
						$size="sm"
						disabled={running}
						onClick={() => void dispatch(resetTranscript())}
					>
						{t("session.reset")}
					</Button>
					<Button type="button" $size="sm" disabled={running} onClick={() => void dispatch(startNewSession())}>
						{t("session.new")}
					</Button>
					<Button
						type="button"
						$size="sm"
						disabled={running}
						onClick={() => void dispatch(closeSession())}
					>
						{t("session.close")}
					</Button>
				</>
			) : (
				<Button
					type="button"
					$size="sm"
					$variant="primary"
					disabled={status !== "connected" || opening}
					onClick={() => dispatch(openSession())}
				>
					{t("session.open")}
				</Button>
			)}

			<IconButton type="button" aria-label={t("app.panel.inspector")} onClick={props.onToggleInspector}>
				◧
			</IconButton>
		</Bar>
	);
}

/** Thin collapsed rail for the config panel. */
export function ConfigRail() {
	const t = useTranslate();
	const dispatch = useAppDispatch();

	return (
		<Rail>
			<IconButton
				type="button"
				aria-label={t("app.panel.show")}
				title={t("config.title")}
				onClick={() => dispatch(uiActions.toggleConfigPanel())}
			>
				›
			</IconButton>
			<Text $size="xs" $tone="faint">
				{t("config.title")}
			</Text>
		</Rail>
	);
}

const Rail = styled.div`
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: ${({ theme }) => theme.space[2]};
	flex: 0 0 auto;
	width: 32px;
	padding: ${({ theme }) => `${theme.space[3]} 0`};
	border-right: 1px solid ${({ theme }) => theme.colors.border};
	background: ${({ theme }) => theme.colors.surface};

	& > span {
		writing-mode: vertical-rl;
		letter-spacing: 0.08em;
	}
`;
