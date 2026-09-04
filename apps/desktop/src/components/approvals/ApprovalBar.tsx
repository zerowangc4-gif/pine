/**
 * Pending tool approvals.
 *
 * Pinned above the composer: when the agent needs a specific tool, ask for that
 * tool only — primary action is allow once, with always-allow / deny beside it.
 */

import { useState } from "react";
import styled from "styled-components";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { formatArgsInline } from "../../lib/format.ts";
import { decideApproval } from "../../store/actions/session.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { selectDecidingApprovals, selectPendingApprovals } from "../../store/slices/approvals.ts";
import { Button, ButtonRow } from "../primitives/Button.tsx";
import { Code, Row, Spacer, Stack, Text } from "../primitives/Surface.tsx";

const Frame = styled.div`
	flex: 0 0 auto;
	border-top: 2px solid ${({ theme }) => theme.colors.warning};
	background: ${({ theme }) => theme.colors.warningSurface};
	padding: ${({ theme }) => `${theme.space[3]} ${theme.space[6]}`};
	max-height: 40vh;
	overflow-y: auto;
`;

const Column = styled(Stack)`
	max-width: ${({ theme }) => theme.layout.maxTranscriptWidth};
	margin: 0 auto;
	width: 100%;
`;

const ToolName = styled.span`
	font-family: ${({ theme }) => theme.font.mono};
	font-size: ${({ theme }) => theme.fontSize.lg};
	font-weight: ${({ theme }) => theme.fontWeight.semibold};
	letter-spacing: -0.02em;
`;

const ReasonInput = styled.input`
	flex: 1 1 160px;
	min-width: 0;
	padding: ${({ theme }) => `${theme.space[1]} ${theme.space[2]}`};
	background: ${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
	font-size: ${({ theme }) => theme.fontSize.sm};
`;

export function ApprovalBar() {
	const t = useTranslate();
	const dispatch = useAppDispatch();
	const pending = useAppSelector(selectPendingApprovals);
	const deciding = useAppSelector(selectDecidingApprovals);
	const [reasons, setReasons] = useState<Record<string, string>>({});

	if (pending.length === 0) return null;

	return (
		<Frame>
			<Column $gap={3}>
				{pending.map((approval) => {
					const busy = deciding.includes(approval.approvalId);
					const reason = reasons[approval.approvalId] ?? "";
					const decide = (kind: "allow" | "allow-always" | "block" | "block-and-stop"): void => {
						dispatch(
							decideApproval(
								approval.approvalId,
								kind === "allow" || kind === "allow-always"
									? { kind }
									: { kind, ...(reason.trim() ? { reason: reason.trim() } : {}) },
							),
						);
					};

					return (
						<Stack key={approval.approvalId} $gap={2}>
							<Row $gap={2} $align="baseline" $wrap>
								<Text $size="xs" $tone="muted">
									{t("approval.request")}
								</Text>
								<ToolName>{approval.toolName}</ToolName>
								{pending.length > 1 ? (
									<Text $size="xs" $tone="faint">
										{t("approval.count", { count: pending.length })}
									</Text>
								) : null}
							</Row>

							<Code $maxHeight="120px">{approval.summary || formatArgsInline(approval.args, 600)}</Code>

							<Row $gap={2} $wrap $align="center">
								<Button
									type="button"
									$size="sm"
									$variant="primary"
									disabled={busy}
									onClick={() => decide("allow")}
								>
									{t("approval.allowTool", { tool: approval.toolName })}
								</Button>
								<Button type="button" $size="sm" disabled={busy} onClick={() => decide("allow-always")}>
									{t("approval.allowAlways", { tool: approval.toolName })}
								</Button>
								<Spacer />
								<ReasonInput
									value={reason}
									placeholder={t("approval.reason")}
									onChange={(event) =>
										setReasons((current) => ({ ...current, [approval.approvalId]: event.target.value }))
									}
								/>
								<ButtonRow>
									<Button type="button" $size="sm" disabled={busy} onClick={() => decide("block")}>
										{t("approval.block")}
									</Button>
									<Button
										type="button"
										$size="sm"
										$variant="danger"
										disabled={busy}
										onClick={() => decide("block-and-stop")}
									>
										{t("approval.blockAndStop")}
									</Button>
								</ButtonRow>
							</Row>
						</Stack>
					);
				})}
			</Column>
		</Frame>
	);
}
