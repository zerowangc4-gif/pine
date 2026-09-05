/**
 * The stored-transcript library.
 *
 * Resuming replays a session's JSONL back into a live agent, including its
 * compaction entries, so a conversation survives closing the app.
 */

import { useEffect } from "react";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { formatCost, formatDateTime, formatTokens, shortenPath } from "../../lib/format.ts";
import { deleteSession, listSessions, resumeStoredSession } from "../../store/actions/library.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import {
	libraryActions,
	selectLibraryLoading,
	selectLibraryScope,
	selectStoredSessions,
} from "../../store/slices/library.ts";
import { selectSessionId } from "../../store/slices/session.ts";
import { selectLocale } from "../../store/slices/ui.ts";
import { Button, ButtonRow } from "../primitives/Button.tsx";
import { Badge, EmptyState, Panel, Row, Spacer, Stack, Text } from "../primitives/Surface.tsx";

export function SessionsTab() {
	const t = useTranslate();
	const dispatch = useAppDispatch();
	const sessions = useAppSelector(selectStoredSessions);
	const scope = useAppSelector(selectLibraryScope);
	const loading = useAppSelector(selectLibraryLoading);
	const activeId = useAppSelector(selectSessionId);
	const locale = useAppSelector(selectLocale);

	// Reload whenever the tab is shown or the scope changes; the list is cheap
	// and stale entries are more confusing than a refetch is expensive.
	useEffect(() => {
		void dispatch(listSessions());
	}, [dispatch, scope]);

	return (
		<Stack $gap={4}>
			<Row $gap={2}>
				<ButtonRow>
					<Button
						type="button"
						$size="sm"
						$variant={scope === "all" ? "primary" : "secondary"}
						onClick={() => dispatch(libraryActions.setScope("all"))}
					>
						{t("inspector.sessions.scopeAll")}
					</Button>
					<Button
						type="button"
						$size="sm"
						$variant={scope === "workspace" ? "primary" : "secondary"}
						onClick={() => dispatch(libraryActions.setScope("workspace"))}
					>
						{t("inspector.sessions.scopeCurrent")}
					</Button>
				</ButtonRow>
				<Spacer />
				<Button type="button" $size="sm" disabled={loading} onClick={() => dispatch(listSessions())}>
					{t("inspector.sessions.refresh")}
				</Button>
			</Row>

			{sessions.length === 0 ? (
				<EmptyState>{loading ? t("common.loading") : t("inspector.sessions.empty")}</EmptyState>
			) : null}

			{sessions.map((session) => (
				<Panel key={session.sessionId} $padding={3}>
					<Stack $gap={2}>
						<Row $gap={2}>
							<Text $size="sm" $weight="medium" $truncate>
								{session.label || session.sessionId.slice(0, 8)}
							</Text>
							{session.sessionId === activeId ? <Badge $tone="accent">{t("connection.connected")}</Badge> : null}
						</Row>

						<Text $size="xs" $mono $tone="faint" $truncate title={session.cwd}>
							{shortenPath(session.cwd, 3)}
						</Text>

						<Row $gap={3} $wrap>
							<Text $size="xs" $tone="muted">
								{formatDateTime(session.modifiedAt, locale)}
							</Text>
							<Text $size="xs" $tone="muted">
								{t("inspector.sessions.messages", { count: session.messageCount })}
							</Text>
							<Text $size="xs" $tone="muted">
								{formatTokens(session.totalTokens)}
							</Text>
							<Text $size="xs" $tone="muted">
								{formatCost(session.costTotal)}
							</Text>
						</Row>

						<Row>
							<Spacer />
							<ButtonRow>
								<Button
									type="button"
									$size="sm"
									$variant="danger"
									onClick={() => dispatch(deleteSession(session.sessionId))}
								>
									{t("inspector.sessions.delete")}
								</Button>
								<Button
									type="button"
									$size="sm"
									disabled={session.sessionId === activeId}
									onClick={() => dispatch(resumeStoredSession(session.sessionId))}
								>
									{t("inspector.sessions.resume")}
								</Button>
							</ButtonRow>
						</Row>
					</Stack>
				</Panel>
			))}
		</Stack>
	);
}
