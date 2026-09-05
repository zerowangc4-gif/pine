/**
 * The two diagnostic panes: the event stream and captured provider traffic.
 *
 * Both are verbatim records rather than summaries — their whole value is being
 * able to see exactly what crossed the wire and in what order.
 */

import { useTranslate } from "../../i18n/useTranslate.ts";
import { formatJson, formatTime } from "../../lib/format.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { selectDraft } from "../../store/slices/config.ts";
import { debugActions, selectEventLog, selectPayloads } from "../../store/slices/debug.ts";
import { selectLocale } from "../../store/slices/ui.ts";
import { Button, ButtonRow } from "../primitives/Button.tsx";
import { Badge, Code, EmptyState, Row, Spacer, Stack, Text } from "../primitives/Surface.tsx";

export function EventsTab() {
	const t = useTranslate();
	const dispatch = useAppDispatch();
	const events = useAppSelector(selectEventLog);
	const locale = useAppSelector(selectLocale);

	return (
		<Stack $gap={3}>
			<Row>
				<Spacer />
				<Button type="button" $size="sm" onClick={() => dispatch(debugActions.clear())}>
					{t("inspector.events.clear")}
				</Button>
			</Row>

			{events.length === 0 ? <EmptyState>{t("inspector.events.empty")}</EmptyState> : null}

			{/* Newest first: during a run, the tail is what matters. */}
			{[...events].reverse().map((entry) => (
				<Row key={entry.key} $gap={2}>
					<Text $size="xs" $tone="faint" $mono>
						{String(entry.seq).padStart(4, "0")}
					</Text>
					<Text $size="xs" $mono>
						{entry.type}
					</Text>
					<Spacer />
					<Text $size="xs" $tone="faint">
						{formatTime(entry.at, locale)}
					</Text>
				</Row>
			))}
		</Stack>
	);
}

export function PayloadsTab() {
	const t = useTranslate();
	const dispatch = useAppDispatch();
	const payloads = useAppSelector(selectPayloads);
	const draft = useAppSelector(selectDraft);
	const locale = useAppSelector(selectLocale);

	return (
		<Stack $gap={3}>
			<Row $gap={2}>
				{draft.debugPayloads ? null : <Badge $tone="warning">{t("common.off")}</Badge>}
				<Spacer />
				<ButtonRow>
					<Button type="button" $size="sm" onClick={() => dispatch(debugActions.clear())}>
						{t("inspector.events.clear")}
					</Button>
				</ButtonRow>
			</Row>

			{payloads.length === 0 ? <EmptyState>{t("inspector.payloads.empty")}</EmptyState> : null}

			{[...payloads].reverse().map((entry) => (
				<Stack key={entry.key} $gap={1}>
					<Row $gap={2}>
						<Badge $tone={entry.direction === "request" ? "neutral" : "success"}>
							{entry.direction === "request"
								? t("inspector.payloads.request")
								: t("inspector.payloads.response")}
						</Badge>
						<Text $size="xs" $tone="faint" $mono>
							#{entry.seq}
						</Text>
						<Spacer />
						<Text $size="xs" $tone="faint">
							{formatTime(entry.at, locale)}
						</Text>
					</Row>
					<Code $maxHeight="240px">{formatJson(entry.body)}</Code>
				</Stack>
			))}
		</Stack>
	);
}
