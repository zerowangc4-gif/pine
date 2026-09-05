/**
 * The non-message items on the transcript.
 *
 * These are the agent's out-of-band signals — a log line, a stop reason, a
 * compaction, a deferred configuration change — rendered inline so the reason
 * a run behaved the way it did sits next to the behaviour itself.
 */

import type { CompactionState, StopReason } from "@pine/protocol";
import styled from "styled-components";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { formatTokens } from "../../lib/format.ts";
import type { NoticeLevel } from "../../store/slices/transcript.ts";
import { Badge, Row, Text } from "../primitives/Surface.tsx";

const Strip = styled(Row)<{ $level: NoticeLevel }>`
	padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
	border-radius: ${({ theme }) => theme.radius.md};
	border: 1px solid
		${({ theme, $level }) => {
			if ($level === "error") return theme.colors.danger;
			if ($level === "warn") return theme.colors.warning;
			return theme.colors.border;
		}};
	background: ${({ theme, $level }) => {
		if ($level === "error") return theme.colors.dangerSurface;
		if ($level === "warn") return theme.colors.warningSurface;
		return theme.colors.sunken;
	}};
	font-size: ${({ theme }) => theme.fontSize.sm};
	line-height: ${({ theme }) => theme.lineHeight.normal};
	white-space: pre-wrap;
	word-break: break-word;
`;

export function NoticeItem({ level, text }: { level: NoticeLevel; text: string }) {
	const t = useTranslate();
	const label = level === "error" ? t("common.error") : level === "warn" ? t("common.warning") : t("common.info");

	return (
		<Strip $level={level} $align="flex-start" $gap={2}>
			<Badge $tone={level === "error" ? "danger" : level === "warn" ? "warning" : "neutral"}>{label}</Badge>
			<Text $size="sm" $tone={level === "error" ? "danger" : "default"}>
				{text}
			</Text>
		</Strip>
	);
}

/** Explains why a run ended early, in the user's own terms. */
export function StopItem({ reason }: { reason: StopReason }) {
	const t = useTranslate();

	const describe = (): string => {
		switch (reason.kind) {
			case "max-turns":
				return t("transcript.stop.maxTurns", { turns: reason.turns });
			case "context-limit":
				return t("transcript.stop.contextLimit", {
					tokens: formatTokens(reason.contextTokens),
					window: formatTokens(reason.contextWindow),
				});
			case "user-requested":
				return t("transcript.stop.userRequested");
			case "tool-terminate":
				return t("transcript.stop.toolTerminate");
		}
	};

	return (
		<Strip $level="info" $align="flex-start" $gap={2}>
			<Badge>{t("transcript.stopped")}</Badge>
			<Text $size="sm">{describe()}</Text>
		</Strip>
	);
}

export function CompactionItem({ compaction, automatic }: { compaction: CompactionState; automatic: boolean }) {
	const t = useTranslate();

	return (
		<Strip $level="info" $align="flex-start" $gap={2}>
			<Badge>{t("transcript.compaction")}</Badge>
			<Text $size="sm" $tone="muted">
				{automatic ? t("transcript.compactionAuto") : t("transcript.compactionManual")} ·{" "}
				{t("transcript.compactionFolded", {
					count: compaction.foldedMessages,
					tokens: formatTokens(compaction.tokensBefore),
				})}
			</Text>
		</Strip>
	);
}

/** A configuration change that could not be applied mid-turn. */
export function TurnPreparedItem({ changes }: { changes: string[] }) {
	const t = useTranslate();

	return (
		<Strip $level="info" $align="flex-start" $gap={2}>
			<Text $size="sm" $tone="muted">
				{t("transcript.turnPrepared", { changes: changes.join(", ") })}
			</Text>
		</Strip>
	);
}
