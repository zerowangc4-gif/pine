/**
 * Application root.
 *
 * Lifecycle (in order):
 *  1. ThemeProvider + GlobalStyle paint the chrome.
 *  2. `attachSubscribe` registers subscriptions and opens the Socket.IO connection.
 *     Torn down on hot reload so handlers do not stack.
 *  3. Every time the sidecar greets us (`readyEpoch` bumps), we open or
 *     reattach a session. Socket.IO connection-state recovery already restores
 *     rooms when possible; this is the fallback for a full sidecar restart.
 *  4. Layout is three columns: configuration, conversation, inspector. Either
 *     side panel collapses to a 32px rail rather than disappearing.
 */

import { useEffect, useRef } from "react";
import styled, { ThemeProvider } from "styled-components";
import { ApprovalBar } from "./components/approvals/ApprovalBar.tsx";
import { Composer } from "./components/composer/Composer.tsx";
import { ConfigPanel } from "./components/config/ConfigPanel.tsx";
import { InspectorPanel, InspectorRail } from "./components/inspector/InspectorPanel.tsx";
import { Button } from "./components/primitives/Button.tsx";
import { EmptyState, Stack, Text } from "./components/primitives/Surface.tsx";
import { ConfigRail, Topbar } from "./components/shell/Topbar.tsx";
import { Transcript } from "./components/transcript/Transcript.tsx";
import { WorkspacePicker } from "./components/workspace/WorkspacePicker.tsx";
import { useTranslate } from "./i18n/useTranslate.ts";
import { attachSubscribe } from "./socket/subscribe.ts";
import { openSession } from "./store/actions/session.ts";
import { useAppDispatch, useAppSelector } from "./store/hooks.ts";
import { store } from "./store/index.ts";
import { selectConfigPanelOpen, selectInspectorOpen, selectTheme, uiActions } from "./store/slices/ui.ts";
import { GlobalStyle } from "./theme/GlobalStyle.ts";
import { themes } from "./theme/themes.ts";

const Shell = styled.div`
	display: flex;
	flex-direction: column;
	height: 100%;
	min-height: 0;
	background: ${({ theme }) => theme.colors.background};
	color: ${({ theme }) => theme.colors.text};
`;

const Body = styled.div`
	display: flex;
	flex: 1 1 auto;
	min-height: 0;
	min-width: 0;
`;

const Center = styled.main`
	display: flex;
	flex-direction: column;
	flex: 1 1 auto;
	min-width: 0;
	min-height: 0;
	background: ${({ theme }) => theme.colors.background};
`;

export function App() {
	const dispatch = useAppDispatch();
	const themeName = useAppSelector(selectTheme);
	const configOpen = useAppSelector(selectConfigPanelOpen);
	const inspectorOpen = useAppSelector(selectInspectorOpen);
	const readyEpoch = useAppSelector((state) => state.connection.readyEpoch);
	const sessionId = useAppSelector((state) => state.session.sessionId);
	const status = useAppSelector((state) => state.connection.status);
	const t = useTranslate();

	// Remember which ready epoch we already reacted to, so a re-render that
	// happens for unrelated reasons does not open a second session.
	const attachedEpochRef = useRef(0);

	// --- 1. Socket subscribe -----------------------------------------------
	useEffect(() => attachSubscribe(store), []);

	// --- 2. Session attach / reattach --------------------------------------
	useEffect(() => {
		if (readyEpoch === 0 || attachedEpochRef.current === readyEpoch) return;
		attachedEpochRef.current = readyEpoch;
		// Passing the current id asks the hub to reattach if the session is
		// still live, otherwise to resume from its JSONL on disk.
		void dispatch(openSession(sessionId));
		// Intentionally omit `sessionId` from deps: we only want this to fire
		// on a new ready epoch, not every time the session id changes.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [readyEpoch, dispatch]);

	return (
		<ThemeProvider theme={themes[themeName]}>
			<GlobalStyle />
			<Shell>
				<Topbar
					onToggleConfig={() => dispatch(uiActions.toggleConfigPanel())}
					onToggleInspector={() => dispatch(uiActions.toggleInspector())}
				/>

				<Body>
					{configOpen ? <ConfigPanel /> : <ConfigRail />}

					<Center>
						{sessionId ? (
							<>
								<Transcript />
								<ApprovalBar />
								<Composer />
							</>
						) : (
							<EmptySession
								connected={status === "connected"}
								onStart={() => dispatch(openSession())}
								hint={t("session.noneBody")}
								title={t("session.none")}
								action={t("session.open")}
								waiting={t("connection.hint")}
							/>
						)}
					</Center>

					{inspectorOpen ? <InspectorPanel /> : <InspectorRail />}
				</Body>

				<WorkspacePicker />
			</Shell>
		</ThemeProvider>
	);
}

function EmptySession(props: {
	connected: boolean;
	onStart: () => void;
	title: string;
	hint: string;
	action: string;
	waiting: string;
}) {
	return (
		<EmptyState>
			<Stack $gap={3} $align="center">
				<Text $size="lg" $weight="semibold">
					{props.title}
				</Text>
				<Text $size="sm" $tone="muted">
					{props.hint}
				</Text>
				{props.connected ? (
					<Button type="button" $variant="primary" onClick={props.onStart}>
						{props.action}
					</Button>
				) : (
					<Text $size="xs" $tone="faint">
						{props.waiting}
					</Text>
				)}
			</Stack>
		</EmptyState>
	);
}
