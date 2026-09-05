/**
 * The conversation pane.
 *
 * Owns one piece of behaviour beyond rendering: follow-the-tail scrolling. It
 * sticks to the bottom while new content arrives, but stops the moment the user
 * scrolls up to read something, and offers a way back down. Losing your place
 * mid-answer is the fastest way to make a streaming UI annoying.
 */

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import styled from "styled-components";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { selectItems, selectStreaming, selectToolProgress, transcriptActions } from "../../store/slices/transcript.ts";
import { Button } from "../primitives/Button.tsx";
import { EmptyState, Row, Stack } from "../primitives/Surface.tsx";
import { MessageBlock } from "./MessageBlock.tsx";
import { CompactionItem, NoticeItem, StopItem, TurnPreparedItem } from "./Notices.tsx";
import { ToolActivity } from "./ToolActivity.tsx";

const Viewport = styled.div`
	position: relative;
	flex: 1 1 auto;
	min-height: 0;
	display: flex;
	flex-direction: column;
`;

const Scroller = styled.div`
	flex: 1 1 auto;
	overflow-y: auto;
	overflow-x: hidden;
	min-height: 0;
	padding: ${({ theme }) => `${theme.space[4]} ${theme.space[6]}`};
`;

/** Keeps long lines readable on a wide window. */
const Column = styled.div`
	max-width: ${({ theme }) => theme.layout.maxTranscriptWidth};
	margin: 0 auto;
	width: 100%;
`;

const JumpButton = styled(Button)`
	position: absolute;
	right: ${({ theme }) => theme.space[6]};
	bottom: ${({ theme }) => theme.space[4]};
	z-index: ${({ theme }) => theme.zIndex.sticky};
	box-shadow: 0 1px 4px rgb(0 0 0 / 18%);
`;

const DismissRow = styled(Row)`
	margin-bottom: ${({ theme }) => theme.space[2]};
`;

/** How close to the bottom still counts as "at the bottom", in pixels. */
const STICK_THRESHOLD_PX = 80;

export function Transcript() {
	const t = useTranslate();
	const dispatch = useAppDispatch();
	const items = useAppSelector(selectItems);
	const streaming = useAppSelector(selectStreaming);
	const toolProgress = useAppSelector(selectToolProgress);

	const scrollerRef = useRef<HTMLDivElement>(null);
	const [stuckToBottom, setStuckToBottom] = useState(true);

	/** Re-evaluated on every scroll: has the user deliberately moved away? */
	const handleScroll = useCallback(() => {
		const element = scrollerRef.current;
		if (!element) return;
		const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
		setStuckToBottom(distance <= STICK_THRESHOLD_PX);
	}, []);

	const scrollToBottom = useCallback((behavior: ScrollBehavior = "auto") => {
		const element = scrollerRef.current;
		if (!element) return;
		element.scrollTo({ top: element.scrollHeight, behavior });
	}, []);

	// Layout effect, not a plain effect: the scroll has to happen in the same
	// frame the new content is painted, or the view visibly jumps.
	useLayoutEffect(() => {
		if (stuckToBottom) scrollToBottom();
	}, [items.length, streaming, toolProgress, stuckToBottom, scrollToBottom]);

	// A brand-new session should start at the bottom regardless of history.
	useEffect(() => {
		scrollToBottom();
		setStuckToBottom(true);
	}, [scrollToBottom]);

	const progress = Object.values(toolProgress);
	const isEmpty = items.length === 0 && !streaming && progress.length === 0;
	const hasNotices = items.some((item) => item.kind === "notice");

	let messageIndex = 0;

	return (
		<Viewport>
			<Scroller ref={scrollerRef} onScroll={handleScroll}>
				<Column>
					{hasNotices ? (
						<DismissRow $gap={2}>
							<Button type="button" $size="sm" onClick={() => dispatch(transcriptActions.dismissNotices())}>
								{t("transcript.dismissNotices")}
							</Button>
						</DismissRow>
					) : null}
					{isEmpty ? (
						<EmptyState>{t("transcript.empty")}</EmptyState>
					) : (
						<Stack $gap={2}>
							{items.map((item) => {
								switch (item.kind) {
									case "message": {
										const index = messageIndex;
										messageIndex += 1;
										return <MessageBlock key={item.key} message={item.message} messageIndex={index} />;
									}
									case "notice":
										return <NoticeItem key={item.key} level={item.level} text={item.text} />;
									case "stop":
										return <StopItem key={item.key} reason={item.reason} />;
									case "compaction":
										return (
											<CompactionItem
												key={item.key}
												compaction={item.compaction}
												automatic={item.automatic}
											/>
										);
									case "turnPrepared":
										return <TurnPreparedItem key={item.key} changes={item.changes} />;
								}
							})}

							{streaming ? <MessageBlock message={streaming} streaming /> : null}
							<ToolActivity progress={progress} />
						</Stack>
					)}
				</Column>
			</Scroller>

			{stuckToBottom ? null : (
				<JumpButton type="button" $size="sm" onClick={() => scrollToBottom("smooth")}>
					{t("transcript.jumpToLatest")}
				</JumpButton>
			)}
		</Viewport>
	);
}
