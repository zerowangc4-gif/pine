/**
 * Working-directory picker.
 *
 * Browses the filesystem through the sidecar rather than a native dialog, so
 * the same component works in the browser dev server and inside Tauri, and so
 * the paths it shows are the ones the agent's tools will actually see.
 *
 * Three ways in, because they suit different moments: type a path, walk the
 * tree, or pick one you have used before.
 */

import { useEffect, useState } from "react";
import styled from "styled-components";
import { useTranslate } from "../../i18n/useTranslate.ts";
import {
	browseDirectory,
	loadRecentWorkspaces,
	switchWorkspace,
	validateWorkspacePath,
} from "../../store/actions/workspace.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { selectWorkspace } from "../../store/slices/session.ts";
import {
	selectListing,
	selectPickerOpen,
	selectRecentWorkspaces,
	selectShowHidden,
	selectWorkspaceValidation,
	workspaceActions,
} from "../../store/slices/workspace.ts";
import { Button, ButtonRow, IconButton } from "../primitives/Button.tsx";
import { ToggleField } from "../primitives/Field.tsx";
import { Badge, Divider, Row, Spacer, Stack, Text } from "../primitives/Surface.tsx";

const Backdrop = styled.div`
	position: fixed;
	inset: 0;
	z-index: ${({ theme }) => theme.zIndex.modal};
	display: flex;
	align-items: center;
	justify-content: center;
	padding: ${({ theme }) => theme.space[8]};
	background: rgb(0 0 0 / 45%);
`;

const Dialog = styled.div`
	display: flex;
	flex-direction: column;
	width: 100%;
	max-width: 640px;
	max-height: 100%;
	background: ${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.borderStrong};
	border-radius: ${({ theme }) => theme.radius.lg};
	overflow: hidden;
`;

const Head = styled(Row)`
	flex: 0 0 auto;
	padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
	border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const Body = styled(Stack)`
	flex: 1 1 auto;
	min-height: 0;
	padding: ${({ theme }) => theme.space[4]};
	overflow-y: auto;
`;

const Foot = styled(Row)`
	flex: 0 0 auto;
	padding: ${({ theme }) => `${theme.space[3]} ${theme.space[4]}`};
	border-top: 1px solid ${({ theme }) => theme.colors.border};
	background: ${({ theme }) => theme.colors.surface};
`;

const PathInput = styled.input`
	flex: 1 1 auto;
	min-width: 0;
	padding: ${({ theme }) => `${theme.space[2]} ${theme.space[2]}`};
	background: ${({ theme }) => theme.colors.background};
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
	font-family: ${({ theme }) => theme.font.mono};
	font-size: ${({ theme }) => theme.fontSize.sm};
	color: ${({ theme }) => theme.colors.text};
`;

const EntryButton = styled.button`
	display: flex;
	align-items: center;
	gap: ${({ theme }) => theme.space[2]};
	width: 100%;
	padding: ${({ theme }) => `${theme.space[2]} ${theme.space[2]}`};
	border: none;
	border-radius: ${({ theme }) => theme.radius.md};
	background: transparent;
	color: ${({ theme }) => theme.colors.text};
	font-family: ${({ theme }) => theme.font.mono};
	font-size: ${({ theme }) => theme.fontSize.sm};
	text-align: left;
	cursor: pointer;

	&:hover {
		background: ${({ theme }) => theme.colors.hover};
	}
`;

const List = styled.div`
	display: flex;
	flex-direction: column;
	gap: ${({ theme }) => theme.space[0]};
	max-height: 280px;
	overflow-y: auto;
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
	padding: ${({ theme }) => theme.space[1]};
`;

export function WorkspacePicker() {
	const t = useTranslate();
	const dispatch = useAppDispatch();

	const open = useAppSelector(selectPickerOpen);
	const listing = useAppSelector(selectListing);
	const recent = useAppSelector(selectRecentWorkspaces);
	const validation = useAppSelector(selectWorkspaceValidation);
	const showHidden = useAppSelector(selectShowHidden);
	const current = useAppSelector(selectWorkspace);
	const switching = useAppSelector((state) => state.workspace.switching);
	const error = useAppSelector((state) => state.workspace.error);

	/** The path in the input, which may differ from the directory being browsed. */
	const [typed, setTyped] = useState("");

	// Opening the picker seeds it with the current workspace and loads both the
	// listing and the recent shortcuts.
	useEffect(() => {
		if (!open) return;
		setTyped(current);
		void dispatch(browseDirectory(current || undefined));
		void dispatch(loadRecentWorkspaces());
	}, [open, current, dispatch]);

	// Re-browse when the hidden-directory toggle changes.
	useEffect(() => {
		if (!open || !listing) return;
		void dispatch(browseDirectory(listing.path));
		// `listing.path` is intentionally omitted: including it would loop, since
		// browsing sets a new listing.
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [showHidden]);

	if (!open) return null;

	const close = (): void => {
		dispatch(workspaceActions.closePicker());
	};
	const target = typed.trim() || listing?.path || "";

	return (
		<Backdrop
			onClick={(event) => {
				// Only a click on the backdrop itself dismisses the dialog.
				if (event.target === event.currentTarget) close();
			}}
		>
			<Dialog role="dialog" aria-modal="true" aria-label={t("workspace.title")}>
				<Head $gap={2}>
					<Text $weight="semibold">{t("workspace.title")}</Text>
					<Spacer />
					<IconButton type="button" aria-label={t("common.close")} onClick={close}>
						×
					</IconButton>
				</Head>

				<Body $gap={4}>
					<Text $size="xs" $tone="muted">
						{t("workspace.hint")}
					</Text>

					{/* Type a path directly, with inline validation. */}
					<Stack $gap={2}>
						<Row $gap={2}>
							<PathInput
								value={typed}
								spellCheck={false}
								placeholder={t("workspace.path")}
								onChange={(event) => setTyped(event.target.value)}
								onBlur={() => typed.trim() && dispatch(validateWorkspacePath(typed.trim()))}
							/>
							{/* Jump the browser to the typed path without choosing it yet. */}
							<Button
								type="button"
								$size="sm"
								disabled={!typed.trim()}
								onClick={() => dispatch(browseDirectory(typed.trim()))}
							>
								→
							</Button>
						</Row>

						{validation && validation.path === target ? (
							<Text $size="xs" $tone={validation.problem ? "danger" : "success"}>
								{validation.problem ?? validation.path}
							</Text>
						) : null}
					</Stack>

					{recent.length > 0 ? (
						<Stack $gap={2}>
							<Text $size="xs" $tone="muted" $weight="medium">
								{t("workspace.recent")}
							</Text>
							<Row $gap={2} $wrap>
								{recent.map((path) => (
									<Button
										key={path}
										type="button"
										$size="sm"
										onClick={() => {
											setTyped(path);
											void dispatch(browseDirectory(path));
										}}
									>
										{path}
									</Button>
								))}
							</Row>
						</Stack>
					) : null}

					<Divider $spacing={0} />

					{/* Walk the tree. */}
					<Stack $gap={2}>
						<Row $gap={2}>
							<Text $size="sm" $mono $truncate>
								{listing?.path ?? t("common.loading")}
							</Text>
							<Spacer />
							{listing ? <Badge>{t("workspace.files", { count: listing.fileCount })}</Badge> : null}
						</Row>

						<List>
							{listing?.parent ? (
								<EntryButton type="button" onClick={() => dispatch(browseDirectory(listing.parent))}>
									<Text $size="sm" $tone="muted">
										../
									</Text>
									<Text $size="xs" $tone="faint">
										{t("workspace.up")}
									</Text>
								</EntryButton>
							) : null}

							{listing?.directories.length === 0 ? (
								<Text $size="sm" $tone="faint" style={{ padding: "8px" }}>
									{t("workspace.empty")}
								</Text>
							) : null}

							{listing?.directories.map((entry) => (
								<EntryButton
									key={entry.path}
									type="button"
									onClick={() => {
										setTyped(entry.path);
										void dispatch(browseDirectory(entry.path));
									}}
								>
									<span aria-hidden>▸</span>
									<Text $size="sm" $mono $tone={entry.hidden ? "faint" : "default"} $truncate>
										{entry.name}
									</Text>
								</EntryButton>
							))}
						</List>

						<ToggleField
							label={t("workspace.showHidden")}
							value={showHidden}
							onChange={() => dispatch(workspaceActions.toggleHidden())}
						/>
					</Stack>

					{error ? (
						<Text $size="sm" $tone="danger">
							{error}
						</Text>
					) : null}
				</Body>

				<Foot $gap={2}>
					<Text $size="xs" $tone="muted" $truncate>
						{target}
					</Text>
					<Spacer />
					<ButtonRow>
						<Button type="button" $size="sm" onClick={close}>
							{t("workspace.cancel")}
						</Button>
						<Button
							type="button"
							$size="sm"
							$variant="primary"
							disabled={!target || switching}
							onClick={() => dispatch(switchWorkspace(target))}
						>
							{switching ? t("workspace.switching") : t("workspace.choose")}
						</Button>
					</ButtonRow>
				</Foot>
			</Dialog>
		</Backdrop>
	);
}
