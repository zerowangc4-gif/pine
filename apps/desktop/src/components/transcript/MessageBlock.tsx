/**
 * Renders one `AgentMessage`.
 *
 * Every role the harness can produce has a case here, including the ones the
 * model never emits directly (bash executions, compaction and branch
 * summaries, application notes), because they all end up on the transcript and
 * hiding them would make the conversation look like it skipped a step.
 */

import type { AgentMessage, AssistantContent, ToolCallContent, UserContent } from "@pine/protocol";
import { messageText } from "@pine/protocol";
import { useState } from "react";
import styled from "styled-components";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { formatArgsInline, formatTokens } from "../../lib/format.ts";
import { truncate } from "../../store/actions/session.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { selectIsRunning } from "../../store/slices/session.ts";
import { Button, IconButton } from "../primitives/Button.tsx";
import { Badge, Code, Row, Spacer, Stack, Text } from "../primitives/Surface.tsx";

const Frame = styled.article<{ $role: string }>`
	display: flex;
	flex-direction: column;
	gap: ${({ theme }) => theme.space[2]};
	padding: ${({ theme }) => `${theme.space[3]} 0`};

	/* A user message is the one thing that gets a left rule, so the eye can
	   find where each exchange begins when scrolling a long transcript. */
	${({ theme, $role }) =>
		$role === "user" ? `border-left: 2px solid ${theme.colors.borderStrong}; padding-left: ${theme.space[3]};` : ""}
`;

const Body = styled.div`
	font-size: ${({ theme }) => theme.fontSize.md};
	line-height: ${({ theme }) => theme.lineHeight.relaxed};
	white-space: pre-wrap;
	word-break: break-word;
	color: ${({ theme }) => theme.colors.text};
`;

const Thumbnail = styled.img`
	max-width: 160px;
	max-height: 160px;
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
	object-fit: cover;
`;

const Collapsible = styled.div`
	border-left: 2px solid ${({ theme }) => theme.colors.border};
	padding-left: ${({ theme }) => theme.space[3]};
	color: ${({ theme }) => theme.colors.textMuted};
	font-size: ${({ theme }) => theme.fontSize.sm};
	line-height: ${({ theme }) => theme.lineHeight.relaxed};
	white-space: pre-wrap;
	word-break: break-word;
`;

/** Header line: who is speaking, plus whatever metadata that role carries. */
const Header = styled(Row)`
	color: ${({ theme }) => theme.colors.textMuted};
	font-size: ${({ theme }) => theme.fontSize.xs};
`;

function textOf(content: string | UserContent[]): string {
	if (typeof content === "string") return content;
	return content
		.filter((part) => part.type === "text")
		.map((part) => (part.type === "text" ? part.text : ""))
		.join("");
}

function imagesOf(content: string | UserContent[]): { data: string; mimeType: string }[] {
	if (typeof content === "string") return [];
	return content.filter((part): part is Extract<UserContent, { type: "image" }> => part.type === "image");
}

/** Reasoning is collapsed by default: informative, but rarely the answer. */
function ThinkingBlock({ text, redacted }: { text: string; redacted?: boolean }) {
	const t = useTranslate();
	const [open, setOpen] = useState(false);

	if (redacted) {
		return (
			<Text $size="xs" $tone="faint">
				{t("transcript.thinkingRedacted")}
			</Text>
		);
	}

	return (
		<Stack $gap={1}>
			<Row $gap={2}>
				<IconButton type="button" onClick={() => setOpen(!open)} aria-expanded={open}>
					{open ? "−" : "+"}
				</IconButton>
				<Text $size="xs" $tone="muted" $weight="medium">
					{t("transcript.thinking")}
				</Text>
			</Row>
			{open ? <Collapsible>{text}</Collapsible> : null}
		</Stack>
	);
}

function ToolCallBlock({ call }: { call: ToolCallContent }) {
	const t = useTranslate();
	return (
		<Row $gap={2} $align="baseline">
			<Badge>{t("transcript.toolCall")}</Badge>
			<Text $size="sm" $mono $weight="medium">
				{call.name}
			</Text>
			<Text $size="sm" $mono $tone="muted" $truncate>
				{formatArgsInline(call.arguments)}
			</Text>
		</Row>
	);
}

function AssistantBody({ content }: { content: AssistantContent[] }) {
	const text = content
		.filter((part) => part.type === "text")
		.map((part) => (part.type === "text" ? part.text : ""))
		.join("");
	const thinking = content.filter((part) => part.type === "thinking");
	const calls = content.filter((part): part is ToolCallContent => part.type === "toolCall");

	return (
		<Stack $gap={2}>
			{thinking.map((part, index) =>
				part.type === "thinking" ? (
					// eslint-disable-next-line react/no-array-index-key
					<ThinkingBlock key={index} text={part.thinking} redacted={part.redacted} />
				) : null,
			)}
			{text ? <Body>{text}</Body> : null}
			{calls.map((call) => (
				<ToolCallBlock key={call.id} call={call} />
			))}
		</Stack>
	);
}

export interface MessageBlockProps {
	message: AgentMessage;
	/** Index in the session message array; used for rewind. */
	messageIndex?: number;
	/** Set while this message is still streaming, to show a live indicator. */
	streaming?: boolean;
}

export function MessageBlock({ message, messageIndex, streaming }: MessageBlockProps) {
	const t = useTranslate();
	const dispatch = useAppDispatch();
	const running = useAppSelector(selectIsRunning);

	const copyText = (): void => {
		const text = messageText(message);
		if (text) void navigator.clipboard.writeText(text);
	};

	const rewind = (): void => {
		if (messageIndex === undefined || running) return;
		// Protocol truncates from `index` onward; +1 keeps this message.
		void dispatch(truncate(messageIndex + 1));
	};

	const actions =
		!streaming && messageIndex !== undefined ? (
			<Row $gap={1}>
				<Button type="button" $size="sm" onClick={copyText}>
					{t("transcript.copy")}
				</Button>
				<Button type="button" $size="sm" disabled={running} onClick={rewind}>
					{t("transcript.truncateHere")}
				</Button>
			</Row>
		) : null;

	switch (message.role) {
		case "user": {
			const images = imagesOf(message.content);
			return (
				<Frame $role="user">
					<Header>
						<Text $size="xs" $tone="muted" $weight="semibold">
							{t("transcript.you")}
						</Text>
						<Spacer />
						{actions}
					</Header>
					<Body>{textOf(message.content)}</Body>
					{images.length > 0 ? (
						<Row $gap={2} $wrap>
							{images.map((image, index) => (
								// eslint-disable-next-line react/no-array-index-key
								<Thumbnail key={index} src={`data:${image.mimeType};base64,${image.data}`} alt="" />
							))}
						</Row>
					) : null}
				</Frame>
			);
		}

		case "assistant":
			return (
				<Frame $role="assistant">
					<Header $gap={2}>
						<Text $size="xs" $tone="muted" $weight="semibold">
							{t("transcript.assistant")}
						</Text>
						<Spacer />
						{streaming ? <Badge>···</Badge> : null}
						{message.usage && message.usage.totalTokens > 0 ? (
							<Text $size="xs" $tone="faint">
								{formatTokens(message.usage.totalTokens)}
							</Text>
						) : null}
						{actions}
					</Header>
					<AssistantBody content={message.content} />
					{message.errorMessage ? (
						<Text $size="sm" $tone="danger">
							{message.errorMessage}
						</Text>
					) : null}
				</Frame>
			);

		case "toolResult": {
			const text = message.content
				.filter((part) => part.type === "text")
				.map((part) => (part.type === "text" ? part.text : ""))
				.join("\n");
			return (
				<Frame $role="toolResult">
					<Header $gap={2}>
						<Badge $tone={message.isError ? "danger" : "neutral"}>
							{message.isError ? t("transcript.toolError") : t("transcript.toolResult")}
						</Badge>
						<Text $size="xs" $mono $tone="muted">
							{message.toolName}
						</Text>
						<Spacer />
						{actions}
					</Header>
					{text ? <Code $maxHeight="240px">{text}</Code> : null}
				</Frame>
			);
		}

		case "bashExecution":
			return (
				<Frame $role="bashExecution">
					<Header $gap={2}>
						<Badge>{t("transcript.bash")}</Badge>
						<Text $size="xs" $mono $tone="muted" $truncate>
							{message.command}
						</Text>
						<Spacer />
						{message.cancelled ? (
							<Text $size="xs" $tone="warning">
								{t("transcript.cancelled")}
							</Text>
						) : null}
						{message.truncated ? (
							<Text $size="xs" $tone="faint">
								{t("transcript.truncated")}
							</Text>
						) : null}
						<Text $size="xs" $tone={message.exitCode ? "danger" : "faint"}>
							{t("transcript.exitCode", { code: message.exitCode ?? "?" })}
						</Text>
						{actions}
					</Header>
					{message.output ? <Code $maxHeight="240px">{message.output}</Code> : null}
				</Frame>
			);

		case "compactionSummary":
			return (
				<Frame $role="compactionSummary">
					<Header $gap={2}>
						<Badge>{t("transcript.compaction")}</Badge>
						<Text $size="xs" $tone="faint">
							{formatTokens(message.tokensBefore)}
						</Text>
						<Spacer />
						{actions}
					</Header>
					<Collapsible>{message.summary}</Collapsible>
				</Frame>
			);

		case "branchSummary":
			return (
				<Frame $role="branchSummary">
					<Header $gap={2}>
						<Badge>{t("transcript.branchSummary")}</Badge>
						<Spacer />
						{actions}
					</Header>
					<Collapsible>{message.summary}</Collapsible>
				</Frame>
			);

		case "custom":
			// `display: false` messages exist only for the model's context.
			if (!message.display) return null;
			return (
				<Frame $role="custom">
					<Header $gap={2}>
						<Badge>{t("transcript.custom")}</Badge>
						<Text $size="xs" $tone="muted">
							{message.customType}
						</Text>
						<Spacer />
						{actions}
					</Header>
					<Body>{textOf(message.content)}</Body>
				</Frame>
			);
	}
}
