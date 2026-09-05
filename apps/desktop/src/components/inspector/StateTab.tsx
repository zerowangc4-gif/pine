/**
 * The raw snapshot, rendered for reading.
 *
 * This is the answer to "what does the agent actually think its state is",
 * which is the first thing worth checking when a run behaves oddly.
 */

import type { AgentMessage } from "@pine/protocol";
import { useEffect, useState } from "react";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { formatCost, formatPercent, formatTokens } from "../../lib/format.ts";
import { clearQueue, setMessages } from "../../store/actions/session.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { selectIsRunning, selectSnapshot } from "../../store/slices/session.ts";
import { Button, ButtonRow } from "../primitives/Button.tsx";
import { ReadOnlyField, TextAreaField } from "../primitives/Field.tsx";
import { Badge, Code, EmptyState, Row, Stack, Text } from "../primitives/Surface.tsx";

export function StateTab() {
	const t = useTranslate();
	const dispatch = useAppDispatch();
	const snapshot = useAppSelector(selectSnapshot);
	const running = useAppSelector(selectIsRunning);
	const [messagesJson, setMessagesJson] = useState("");
	const [messagesError, setMessagesError] = useState<string>();

	useEffect(() => {
		if (!snapshot) {
			setMessagesJson("");
			return;
		}
		setMessagesJson(JSON.stringify(snapshot.messages, null, 2));
		setMessagesError(undefined);
	}, [snapshot?.sessionId, snapshot?.messages.length]);

	if (!snapshot) return <EmptyState>{t("session.none")}</EmptyState>;

	const contextFraction = snapshot.contextWindow > 0 ? snapshot.contextTokens / snapshot.contextWindow : 0;
	const steeringQueued = snapshot.queued.filter((entry) => entry.queue === "steering");
	const followUpQueued = snapshot.queued.filter((entry) => entry.queue === "followUp");

	const applyMessages = (): void => {
		try {
			const parsed = JSON.parse(messagesJson) as unknown;
			if (!Array.isArray(parsed)) throw new Error("Messages must be a JSON array.");
			setMessagesError(undefined);
			void dispatch(setMessages(parsed as AgentMessage[]));
		} catch (error) {
			setMessagesError(error instanceof Error ? error.message : String(error));
		}
	};

	return (
		<Stack $gap={4}>
			<Row $gap={2} $wrap>
				{snapshot.isStreaming ? <Badge $tone="accent">{t("inspector.state.streaming")}</Badge> : null}
				{snapshot.stopRequested ? <Badge $tone="warning">{t("composer.stop")}</Badge> : null}
				{snapshot.aborting ? <Badge $tone="danger">{t("composer.abort")}</Badge> : null}
			</Row>

			<ReadOnlyField label={t("session.id")}>
				<Text $size="sm" $mono $truncate>
					{snapshot.sessionId}
				</Text>
			</ReadOnlyField>

			<ReadOnlyField label={t("workspace.title")}>
				<Text $size="sm" $mono $truncate>
					{snapshot.workspace}
				</Text>
			</ReadOnlyField>

			<Row $gap={4} $wrap>
				<ReadOnlyField label={t("session.turns")}>
					<Text $size="sm">{snapshot.turnCount}</Text>
				</ReadOnlyField>
				<ReadOnlyField label={t("session.requests")}>
					<Text $size="sm">{snapshot.usage.requests}</Text>
				</ReadOnlyField>
				<ReadOnlyField label={t("session.tokens")}>
					<Text $size="sm">{formatTokens(snapshot.usage.totalTokens)}</Text>
				</ReadOnlyField>
				<ReadOnlyField label={t("session.cost")}>
					<Text $size="sm">{formatCost(snapshot.usage.cost)}</Text>
				</ReadOnlyField>
			</Row>

			<ReadOnlyField label={t("session.context")}>
				<Text $size="sm">
					{formatTokens(snapshot.contextTokens)} / {formatTokens(snapshot.contextWindow)} ·{" "}
					{formatPercent(contextFraction)}
				</Text>
			</ReadOnlyField>

			{snapshot.compaction ? (
				<ReadOnlyField label={t("transcript.compaction")}>
					<Text $size="sm" $tone="muted">
						{t("transcript.compactionFolded", {
							count: snapshot.compaction.foldedMessages,
							tokens: formatTokens(snapshot.compaction.tokensBefore),
						})}
					</Text>
				</ReadOnlyField>
			) : null}

			<ReadOnlyField label={t("inspector.state.toolNames")}>
				<Text $size="sm" $mono>
					{snapshot.toolNames.join(", ") || t("inspector.state.none")}
				</Text>
			</ReadOnlyField>

			{snapshot.pendingToolCalls.length > 0 ? (
				<ReadOnlyField label={t("inspector.state.pendingTools")}>
					<Text $size="sm" $mono>
						{snapshot.pendingToolCalls.join(", ")}
					</Text>
				</ReadOnlyField>
			) : null}

			{snapshot.queued.length > 0 ? (
				<Stack $gap={2}>
					<ReadOnlyField label={t("inspector.state.queued")}>
						<Stack $gap={1}>
							{snapshot.queued.map((entry) => (
								<Row key={entry.id} $gap={2}>
									<Badge>{entry.queue}</Badge>
									<Text $size="sm" $truncate>
										{entry.text}
									</Text>
								</Row>
							))}
						</Stack>
					</ReadOnlyField>
					<ButtonRow>
						{steeringQueued.length > 0 ? (
							<Button type="button" $size="sm" onClick={() => dispatch(clearQueue("steering"))}>
								{t("inspector.state.clearSteering")}
							</Button>
						) : null}
						{followUpQueued.length > 0 ? (
							<Button type="button" $size="sm" onClick={() => dispatch(clearQueue("followUp"))}>
								{t("inspector.state.clearFollowUp")}
							</Button>
						) : null}
						<Button type="button" $size="sm" onClick={() => dispatch(clearQueue("all"))}>
							{t("inspector.state.clearAllQueues")}
						</Button>
					</ButtonRow>
				</Stack>
			) : null}

			{snapshot.errorMessage ? (
				<ReadOnlyField label={t("inspector.state.error")}>
					<Text $size="sm" $tone="danger">
						{snapshot.errorMessage}
					</Text>
				</ReadOnlyField>
			) : null}

			{snapshot.transcriptPath ? (
				<ReadOnlyField label={t("session.transcriptPath")}>
					<Text $size="xs" $mono $tone="muted">
						{snapshot.transcriptPath}
					</Text>
				</ReadOnlyField>
			) : null}

			<Stack $gap={2}>
				<TextAreaField
					label={t("inspector.state.messages")}
					value={messagesJson}
					onChange={setMessagesJson}
					hint={t("inspector.state.messagesHint")}
				/>
				{messagesError ? (
					<Text $size="sm" $tone="danger">
						{messagesError}
					</Text>
				) : null}
				<Button type="button" $size="sm" disabled={running} onClick={applyMessages}>
					{t("inspector.state.applyMessages")}
				</Button>
			</Stack>

			<ReadOnlyField label={t("inspector.state.systemPrompt")}>
				<Code $maxHeight="240px">{snapshot.systemPrompt}</Code>
			</ReadOnlyField>
		</Stack>
	);
}
