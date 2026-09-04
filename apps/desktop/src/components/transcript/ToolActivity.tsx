/**
 * Live tool execution, rendered from the `tool_execution_*` events.
 *
 * This is intentionally separate from the transcript's tool-result messages:
 * results only exist once a tool has finished, and a shell command that takes
 * thirty seconds should not look like nothing is happening.
 */

import styled, { keyframes } from "styled-components";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { formatArgsInline } from "../../lib/format.ts";
import { Badge, Row, Stack, Text } from "../primitives/Surface.tsx";
import type { ToolProgress } from "../../store/slices/transcript.ts";

const pulse = keyframes`
	0%, 100% { opacity: 0.35; }
	50% { opacity: 1; }
`;

const Pulse = styled.span`
	display: inline-block;
	width: 6px;
	height: 6px;
	border-radius: 50%;
	background: ${({ theme }) => theme.colors.text};
	animation: ${pulse} 1.2s ease-in-out infinite;
`;

const Partial = styled.pre`
	margin: 0;
	padding: ${({ theme }) => theme.space[2]};
	background: ${({ theme }) => theme.colors.sunken};
	border-radius: ${({ theme }) => theme.radius.md};
	font-family: ${({ theme }) => theme.font.mono};
	font-size: ${({ theme }) => theme.fontSize.xs};
	color: ${({ theme }) => theme.colors.textMuted};
	max-height: 120px;
	overflow: auto;
	white-space: pre-wrap;
`;

export function ToolActivity({ progress }: { progress: ToolProgress[] }) {
	const t = useTranslate();
	// Finished calls are represented by their result message; only show the
	// ones still in flight.
	const running = progress.filter((entry) => !entry.done);
	if (running.length === 0) return null;

	return (
		<Stack $gap={2}>
			{running.map((entry) => (
				<Stack key={entry.toolCallId} $gap={1}>
					<Row $gap={2} $align="baseline">
						<Pulse />
						<Badge>{t("transcript.toolRunning")}</Badge>
						<Text $size="sm" $mono $weight="medium">
							{entry.toolName}
						</Text>
						<Text $size="sm" $mono $tone="muted" $truncate>
							{formatArgsInline(entry.args)}
						</Text>
					</Row>
					{entry.partial !== undefined ? <Partial>{formatArgsInline(entry.partial, 2000)}</Partial> : null}
				</Stack>
			))}
		</Stack>
	);
}
