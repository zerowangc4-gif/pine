/**
 * The input area.
 *
 * Its whole job is to route one piece of text to the right agent entry point,
 * which depends on whether a run is in flight:
 *
 *  - idle    -> `prompt`, starting a new run
 *  - running -> `steer`, injected before the next assistant response
 *
 * Follow-up is offered separately because it means something different: run
 * this once the agent would otherwise have stopped.
 */

import { useCallback, useRef, useState, type ChangeEvent, type KeyboardEvent } from "react";
import styled from "styled-components";
import type { ImageContent } from "@pine/protocol";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { basename } from "../../lib/format.ts";
import { abortRun, continueAgent, followUpAgent, promptAgent, requestStop, steerAgent } from "../../store/actions/session.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { selectDraft } from "../../store/slices/config.ts";
import { selectIsRunning, selectSnapshot, selectWorkspace } from "../../store/slices/session.ts";
import { selectItems } from "../../store/slices/transcript.ts";
import { Button, ButtonRow, IconButton } from "../primitives/Button.tsx";
import { Badge, Row, Spacer, Stack, Text } from "../primitives/Surface.tsx";

const Frame = styled.div`
	flex: 0 0 auto;
	border-top: 1px solid ${({ theme }) => theme.colors.border};
	background: ${({ theme }) => theme.colors.surface};
	padding: ${({ theme }) => `${theme.space[3]} ${theme.space[6]}`};
`;

const Column = styled(Stack)`
	max-width: ${({ theme }) => theme.layout.maxTranscriptWidth};
	margin: 0 auto;
	width: 100%;
`;

const Input = styled.textarea`
	width: 100%;
	min-height: 64px;
	max-height: 240px;
	padding: ${({ theme }) => theme.space[3]};
	background: ${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
	color: ${({ theme }) => theme.colors.text};
	font-size: ${({ theme }) => theme.fontSize.md};
	line-height: ${({ theme }) => theme.lineHeight.normal};
	resize: none;
	overflow-y: auto;

	&::placeholder {
		color: ${({ theme }) => theme.colors.textFaint};
	}
	&:hover:not(:disabled) {
		border-color: ${({ theme }) => theme.colors.borderStrong};
	}
	&:disabled {
		background: ${({ theme }) => theme.colors.sunken};
	}
`;

const Attachment = styled(Row)`
	padding: ${({ theme }) => `${theme.space[1]} ${theme.space[2]}`};
	background: ${({ theme }) => theme.colors.sunken};
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
	font-size: ${({ theme }) => theme.fontSize.xs};
`;

const HiddenFileInput = styled.input`
	display: none;
`;

interface Attached extends ImageContent {
	name: string;
}

/** Strip the `data:...;base64,` prefix the protocol does not carry. */
function toImageContent(name: string, dataUrl: string): Attached | undefined {
	const match = /^data:([^;]+);base64,(.*)$/.exec(dataUrl);
	if (!match?.[1] || !match[2]) return undefined;
	return { type: "image", name, mimeType: match[1], data: match[2] };
}

export function Composer() {
	const t = useTranslate();
	const dispatch = useAppDispatch();

	const running = useAppSelector(selectIsRunning);
	const snapshot = useAppSelector(selectSnapshot);
	const workspace = useAppSelector(selectWorkspace);
	const draft = useAppSelector(selectDraft);
	const transcriptItems = useAppSelector(selectItems);

	const [text, setText] = useState("");
	const [images, setImages] = useState<Attached[]>([]);
	const fileInputRef = useRef<HTMLInputElement>(null);

	const sessionOpen = snapshot !== undefined;
	const canSend = sessionOpen && (text.trim().length > 0 || images.length > 0);
	const supportsImages = draft.model.supportsImages;
	const queuedCount = snapshot?.queued.length ?? 0;
	const hasHistory = transcriptItems.some((item) => item.kind === "message");
	const canContinue = sessionOpen && !running && hasHistory;

	const clear = useCallback(() => {
		setText("");
		setImages([]);
	}, []);

	/** Idle sends a prompt; a run in flight is steered instead. */
	const submit = useCallback(() => {
		if (!canSend) return;
		const payload = images.map(({ name: _name, ...image }) => image);
		if (running) dispatch(steerAgent(text, payload));
		else dispatch(promptAgent(text, payload));
		clear();
	}, [canSend, clear, dispatch, images, running, text]);

	const submitFollowUp = useCallback(() => {
		if (!canSend) return;
		dispatch(followUpAgent(text, images.map(({ name: _name, ...image }) => image)));
		clear();
	}, [canSend, clear, dispatch, images, text]);

	const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>): void => {
		// Enter sends, Shift+Enter inserts a newline. IME composition must be left
		// alone or Chinese input would submit on every candidate selection.
		if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
			event.preventDefault();
			submit();
		}
	};

	const onFilesChosen = (event: ChangeEvent<HTMLInputElement>): void => {
		const files = Array.from(event.target.files ?? []);
		event.target.value = "";
		for (const file of files) {
			const reader = new FileReader();
			reader.onload = () => {
				const attached = toImageContent(file.name, String(reader.result));
				if (attached) setImages((current) => [...current, attached]);
			};
			reader.readAsDataURL(file);
		}
	};

	return (
		<Frame>
			<Column $gap={2}>
				{images.length > 0 ? (
					<Row $gap={2} $wrap>
						{images.map((image, index) => (
							// eslint-disable-next-line react/no-array-index-key
							<Attachment key={index} $gap={2}>
								<Text $size="xs" $truncate>
									{basename(image.name)}
								</Text>
								<IconButton
									type="button"
									aria-label={t("composer.remove")}
									onClick={() => setImages((current) => current.filter((_, position) => position !== index))}
								>
									×
								</IconButton>
							</Attachment>
						))}
					</Row>
				) : null}

				<Input
					value={text}
					disabled={!sessionOpen}
					placeholder={
						running
							? t("composer.placeholderBusy")
							: t("composer.placeholder", { workspace: basename(workspace) || "…" })
					}
					onChange={(event) => setText(event.target.value)}
					onKeyDown={onKeyDown}
				/>

				<Row $gap={2}>
					<IconButton
						type="button"
						aria-label={supportsImages ? t("composer.attach") : t("composer.attachUnsupported")}
						title={supportsImages ? t("composer.attach") : t("composer.attachUnsupported")}
						disabled={!sessionOpen || !supportsImages}
						onClick={() => fileInputRef.current?.click()}
					>
						+
					</IconButton>
					<HiddenFileInput
						ref={fileInputRef}
						type="file"
						accept="image/png,image/jpeg,image/gif,image/webp"
						multiple
						onChange={onFilesChosen}
					/>

					<Text $size="xs" $tone="faint">
						{t("composer.hint")}
					</Text>

					{queuedCount > 0 ? <Badge>{t("composer.queued", { count: queuedCount })}</Badge> : null}

					<Spacer />

					<ButtonRow>
						{running ? (
							<>
								{snapshot?.stopRequested ? (
									<Button type="button" $size="sm" onClick={() => dispatch(requestStop(true))}>
										{t("composer.stopCancel")}
									</Button>
								) : (
									<Button type="button" $size="sm" onClick={() => dispatch(requestStop(false))}>
										{t("composer.stop")}
									</Button>
								)}
								<Button type="button" $size="sm" $variant="danger" onClick={() => dispatch(abortRun())}>
									{t("composer.abort")}
								</Button>
							</>
						) : null}

						{canContinue ? (
							<Button type="button" $size="sm" onClick={() => void dispatch(continueAgent())}>
								{t("composer.continue")}
							</Button>
						) : null}

						<Button type="button" $size="sm" disabled={!canSend} onClick={submitFollowUp}>
							{t("composer.followUp")}
						</Button>

						<Button type="button" $size="sm" $variant="primary" disabled={!canSend} onClick={submit}>
							{running ? t("composer.steer") : t("composer.send")}
						</Button>
					</ButtonRow>
				</Row>
			</Column>
		</Frame>
	);
}
