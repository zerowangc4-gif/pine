/**
 * The configuration panel.
 *
 * Exposes every field of `AgentConfig`, grouped by the part of the agent it
 * reaches. Edits land in the local draft and are pushed on Apply, which is what
 * makes the "N unsaved changes" counter meaningful and lets a wrong value be
 * reverted before it touches a run.
 *
 * Two exceptions apply immediately, because waiting would feel broken:
 * the thinking level and the working directory.
 */

import styled from "styled-components";
import {
	ALL_TOOL_NAMES,
	THINKING_LEVELS,
	type ToolExecutionMode,
	type ToolName,
	type ToolSetting,
} from "@pine/protocol";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { formatBytes, formatTokens } from "../../lib/format.ts";
import { inspectModel } from "../../store/actions/library.ts";
import { applyConfig, compactNow, configureNow, reloadResources } from "../../store/actions/session.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { configActions, selectDirtyFields, selectDraft } from "../../store/slices/config.ts";
import { selectInspecting, selectInspection } from "../../store/slices/library.ts";
import { selectIsRunning, selectSnapshot, selectWorkspace } from "../../store/slices/session.ts";
import { uiActions } from "../../store/slices/ui.ts";
import { workspaceActions } from "../../store/slices/workspace.ts";
import { Button, ButtonRow } from "../primitives/Button.tsx";
import {
	ListField,
	NumberField,
	SelectField,
	TextAreaField,
	TextField,
	ToggleField,
} from "../primitives/Field.tsx";
import { Badge, Row, ScrollArea, Section, SectionTitle, Spacer, Stack, Text } from "../primitives/Surface.tsx";
import {
	apiOptions,
	approvalOptions,
	executionModeOptions,
	queueModeOptions,
	thinkingOptions,
	toolExecutionOverrideOptions,
	toolLabel,
	transportOptions,
} from "./options.ts";

const Frame = styled.aside`
	display: flex;
	flex-direction: column;
	flex: 0 0 auto;
	width: ${({ theme }) => theme.layout.sidebarWidth};
	border-right: 1px solid ${({ theme }) => theme.colors.border};
	background: ${({ theme }) => theme.colors.surface};
	min-height: 0;
`;

const Header = styled(Row)`
	flex: 0 0 auto;
	padding: ${({ theme }) => `${theme.space[2]} ${theme.space[3]}`};
	border-bottom: 1px solid ${({ theme }) => theme.colors.border};
`;

const StickyFooter = styled(Row)`
	flex: 0 0 auto;
	padding: ${({ theme }) => theme.space[3]};
	border-top: 1px solid ${({ theme }) => theme.colors.border};
	background: ${({ theme }) => theme.colors.background};
`;

const WorkspaceRow = styled(Row)`
	padding: ${({ theme }) => theme.space[2]};
	background: ${({ theme }) => theme.colors.sunken};
	border: 1px solid ${({ theme }) => theme.colors.border};
	border-radius: ${({ theme }) => theme.radius.md};
`;

export function ConfigPanel() {
	const t = useTranslate();
	const dispatch = useAppDispatch();

	const draft = useAppSelector(selectDraft);
	const dirty = useAppSelector(selectDirtyFields);
	const snapshot = useAppSelector(selectSnapshot);
	const running = useAppSelector(selectIsRunning);
	const workspace = useAppSelector(selectWorkspace);
	const inspection = useAppSelector(selectInspection);
	const inspecting = useAppSelector(selectInspecting);

	const patch = configActions.patchDraft;
	const sessionOpen = snapshot !== undefined;

	/** Replace one tool's settings, adding it if an older draft lacked it. */
	const setTool = (name: ToolName, changes: Partial<ToolSetting>): void => {
		const existing = draft.tools.find((tool) => tool.name === name);
		const next: ToolSetting[] = existing
			? draft.tools.map((tool) => (tool.name === name ? { ...tool, ...changes } : tool))
			: [...draft.tools, { name, enabled: false, ...changes }];
		dispatch(patch({ tools: next }));
	};

	return (
		<Frame>
			<Header>
				<Text $size="sm" $weight="semibold">
					{t("config.title")}
				</Text>
				<Spacer />
				<Button type="button" $size="sm" onClick={() => dispatch(uiActions.toggleConfigPanel())}>
					{t("app.panel.hide")}
				</Button>
			</Header>
			<ScrollArea $padding={4}>
				<Stack $gap={0}>
					{/* --- workspace ------------------------------------------------ */}
					<Section>
						<SectionTitle>{t("config.section.workspace")}</SectionTitle>
						<WorkspaceRow $gap={2}>
							<Text $size="sm" $mono $truncate title={workspace || draft.cwd}>
								{workspace || draft.cwd || t("common.unknown")}
							</Text>
							<Spacer />
							<Button type="button" $size="sm" onClick={() => dispatch(workspaceActions.openPicker())}>
								{t("workspace.change")}
							</Button>
						</WorkspaceRow>
						<Text $size="xs" $tone="faint">
							{t("workspace.hint")}
						</Text>
					</Section>

					{/* --- model ---------------------------------------------------- */}
					<Section>
						<SectionTitle>{t("config.section.model")}</SectionTitle>

						<SelectField
							label={t("config.model.api")}
							value={draft.model.api}
							options={apiOptions()}
							onChange={(api) => dispatch(patch({ model: { api } }))}
						/>
						<TextField
							label={t("config.model.modelId")}
							value={draft.model.modelId}
							mono
							onChange={(modelId) => dispatch(patch({ model: { modelId } }))}
						/>
						<TextField
							label={t("config.model.displayName")}
							value={draft.model.displayName ?? ""}
							onChange={(displayName) =>
								dispatch(patch({ model: { displayName: displayName || undefined } }))
							}
						/>
						<TextField
							label={t("config.model.baseUrl")}
							value={draft.model.baseUrl}
							mono
							onChange={(baseUrl) => dispatch(patch({ model: { baseUrl } }))}
						/>
						<TextField
							label={t("config.model.providerId")}
							value={draft.model.providerId}
							mono
							onChange={(providerId) => dispatch(patch({ model: { providerId } }))}
						/>
						<TextField
							label={t("config.model.apiKey")}
							value={draft.apiKey}
							secret
							hint={t("config.model.apiKeyHint")}
							onChange={(apiKey) => dispatch(patch({ apiKey }))}
						/>

						<ToggleField
							label={t("config.model.reasoning")}
							value={draft.model.reasoning}
							onChange={(reasoning) => dispatch(patch({ model: { reasoning } }))}
						/>
						<ToggleField
							label={t("config.model.supportsImages")}
							value={draft.model.supportsImages}
							onChange={(supportsImages) => dispatch(patch({ model: { supportsImages } }))}
						/>

						<NumberField
							label={t("config.model.contextWindow")}
							value={draft.model.contextWindow}
							min={1024}
							step={1024}
							hint={formatTokens(draft.model.contextWindow)}
							onChange={(contextWindow) => dispatch(patch({ model: { contextWindow } }))}
						/>
						<NumberField
							label={t("config.model.maxTokens")}
							value={draft.model.maxTokens}
							min={1}
							step={256}
							onChange={(maxTokens) => dispatch(patch({ model: { maxTokens } }))}
						/>

						<SectionTitle>{t("config.model.cost")}</SectionTitle>
						<NumberField
							label={t("config.model.costInput")}
							value={draft.model.cost.input}
							min={0}
							step={0.1}
							onChange={(input) => dispatch(patch({ model: { cost: { ...draft.model.cost, input } } }))}
						/>
						<NumberField
							label={t("config.model.costOutput")}
							value={draft.model.cost.output}
							min={0}
							step={0.1}
							onChange={(output) => dispatch(patch({ model: { cost: { ...draft.model.cost, output } } }))}
						/>
						<NumberField
							label={t("config.model.costCacheRead")}
							value={draft.model.cost.cacheRead}
							min={0}
							step={0.1}
							onChange={(cacheRead) =>
								dispatch(patch({ model: { cost: { ...draft.model.cost, cacheRead } } }))
							}
						/>
						<NumberField
							label={t("config.model.costCacheWrite")}
							value={draft.model.cost.cacheWrite}
							min={0}
							step={0.1}
							onChange={(cacheWrite) =>
								dispatch(patch({ model: { cost: { ...draft.model.cost, cacheWrite } } }))
							}
						/>

						{/* Thinking level applies at once: the picker only lists levels the
						    server said this model supports, so nothing gets clamped away. */}
						<SelectField
							label={t("config.model.thinkingLevel")}
							value={draft.thinkingLevel}
							options={thinkingOptions(snapshot?.supportedThinkingLevels ?? [])}
							disabled={!draft.model.reasoning}
							onChange={(thinkingLevel) => dispatch(configureNow({ thinkingLevel }))}
						/>

						<SectionTitle>{t("config.model.thinkingBudgets")}</SectionTitle>
						{(["minimal", "low", "medium", "high"] as const).map((level) => (
							<NumberField
								key={level}
								label={level}
								value={draft.thinkingBudgets[level] ?? 0}
								min={0}
								step={256}
								disabled={!draft.model.reasoning}
								onChange={(tokens) =>
									dispatch(
										patch({
											thinkingBudgets: {
												...draft.thinkingBudgets,
												[level]: tokens > 0 ? tokens : undefined,
											},
										}),
									)
								}
							/>
						))}

						<SectionTitle>{t("config.model.thinkingLevelMap")}</SectionTitle>
						<Text $size="xs" $tone="faint">
							{t("config.model.thinkingLevelMapHint")}
						</Text>
						{THINKING_LEVELS.filter((level) => level !== "off").map((level) => {
							const mapped = draft.model.thinkingLevelMap?.[level];
							const display = mapped === null ? "null" : (mapped ?? "");
							return (
								<TextField
									key={level}
									label={level}
									value={display}
									mono
									disabled={!draft.model.reasoning}
									onChange={(raw) => {
										const next = { ...(draft.model.thinkingLevelMap ?? {}) };
										const trimmed = raw.trim();
										if (!trimmed) delete next[level];
										else if (trimmed === "null") next[level] = null;
										else next[level] = trimmed;
										dispatch(
											patch({
												model: {
													thinkingLevelMap: Object.keys(next).length > 0 ? next : undefined,
												},
											}),
										);
									}}
								/>
							);
						})}

						<Row $gap={2}>
							<Button type="button" $size="sm" disabled={inspecting} onClick={() => dispatch(inspectModel())}>
								{t("config.model.inspect")}
							</Button>
							{inspection ? (
								<Text $size="xs" $tone="muted">
									{t("config.model.inspectResult", {
										levels: inspection.supportedThinkingLevels.join(", "),
										credential: inspection.hasCredential
											? t("config.model.credentialYes")
											: t("config.model.credentialNo"),
									})}
								</Text>
							) : null}
						</Row>
					</Section>

					{/* --- prompt --------------------------------------------------- */}
					<Section>
						<SectionTitle>{t("config.section.prompt")}</SectionTitle>
						<TextAreaField
							label={t("config.prompt.system")}
							value={draft.systemPrompt}
							rows={8}
							onChange={(systemPrompt) => dispatch(patch({ systemPrompt }))}
						/>
						<ToggleField
							label={t("config.prompt.appendSkills")}
							value={draft.appendSkillsToSystemPrompt}
							onChange={(appendSkillsToSystemPrompt) => dispatch(patch({ appendSkillsToSystemPrompt }))}
						/>
					</Section>

					{/* --- tools ---------------------------------------------------- */}
					<Section>
						<SectionTitle>{t("config.section.tools")}</SectionTitle>
						<SelectField
							label={t("config.tools.executionMode")}
							value={draft.toolExecution}
							options={executionModeOptions()}
							onChange={(toolExecution) => dispatch(patch({ toolExecution }))}
						/>

						{ALL_TOOL_NAMES.map((name) => {
							const setting = draft.tools.find((tool) => tool.name === name);
							return (
								<Stack key={name} $gap={2}>
									<ToggleField
										label={`${name} — ${toolLabel(t, name)}`}
										value={setting?.enabled ?? false}
										onChange={(enabled) => setTool(name, { enabled })}
									/>
									{setting?.enabled ? (
										<SelectField
											label={t("config.tools.perTool")}
											value={setting.executionMode ?? ""}
											options={toolExecutionOverrideOptions(t)}
											onChange={(mode) =>
												setTool(name, {
													...(mode ? { executionMode: mode as ToolExecutionMode } : { executionMode: undefined }),
												})
											}
										/>
									) : null}
								</Stack>
							);
						})}
					</Section>

					{/* --- approvals ------------------------------------------------ */}
					<Section>
						<SectionTitle>{t("config.section.approvals")}</SectionTitle>
						<SelectField
							label={t("config.approvals.policy")}
							value={draft.approvalPolicy}
							options={approvalOptions(t)}
							hint={t(
								`permissions.hint.${draft.approvalPolicy === "ask-writes" ? "askWrites" : draft.approvalPolicy}`,
							)}
							onChange={(approvalPolicy) => dispatch(patch({ approvalPolicy }))}
						/>
						<Text $size="sm" $weight="medium">
							{t("config.approvals.autoApproved")}
						</Text>
						<Text $size="xs" $tone="faint">
							{t("config.approvals.autoApprovedHint")}
						</Text>
						{ALL_TOOL_NAMES.filter((name) => name !== "finish").map((name) => (
							<ToggleField
								key={`auto-${name}`}
								label={t("config.approvals.alwaysAllowTool", { tool: name })}
								hint={toolLabel(t, name)}
								value={draft.autoApprovedTools.includes(name)}
								onChange={(on) => {
									const next = on
										? [...new Set([...draft.autoApprovedTools, name])]
										: draft.autoApprovedTools.filter((tool) => tool !== name);
									dispatch(patch({ autoApprovedTools: next }));
								}}
							/>
						))}
						<ListField
							label={t("config.approvals.blockedBash")}
							values={draft.blockedBashPatterns}
							hint={t("config.approvals.blockedBashHint")}
							addLabel={t("common.add")}
							removeLabel={t("common.remove")}
							onChange={(blockedBashPatterns) => dispatch(patch({ blockedBashPatterns }))}
						/>
						<TextField
							label={t("config.approvals.bashPrefix")}
							value={draft.bashCommandPrefix ?? ""}
							mono
							onChange={(bashCommandPrefix) => dispatch(patch({ bashCommandPrefix }))}
						/>
					</Section>

					{/* --- limits --------------------------------------------------- */}
					<Section>
						<SectionTitle>{t("config.section.limits")}</SectionTitle>
						<NumberField
							label={t("config.limits.maxTurns")}
							value={draft.maxTurns}
							min={0}
							hint={t("config.limits.maxTurnsHint")}
							onChange={(maxTurns) => dispatch(patch({ maxTurns }))}
						/>
						<NumberField
							label={t("config.limits.stopAtContextFraction")}
							value={draft.stopAtContextFraction}
							min={0}
							max={1}
							step={0.05}
							onChange={(stopAtContextFraction) => dispatch(patch({ stopAtContextFraction }))}
						/>
						<NumberField
							label={t("config.limits.maxToolResultBytes")}
							value={draft.maxToolResultBytes}
							min={0}
							step={1024}
							hint={formatBytes(draft.maxToolResultBytes)}
							onChange={(maxToolResultBytes) => dispatch(patch({ maxToolResultBytes }))}
						/>
						<NumberField
							label={t("config.limits.maxRetryDelayMs")}
							value={draft.maxRetryDelayMs ?? 0}
							min={0}
							step={500}
							onChange={(maxRetryDelayMs) => dispatch(patch({ maxRetryDelayMs }))}
						/>
					</Section>

					{/* --- context -------------------------------------------------- */}
					<Section>
						<SectionTitle>{t("config.section.context")}</SectionTitle>
						<ToggleField
							label={t("config.context.compactionEnabled")}
							value={draft.compaction.enabled}
							onChange={(enabled) => dispatch(patch({ compaction: { enabled } }))}
						/>
						<NumberField
							label={t("config.context.reserveTokens")}
							value={draft.compaction.reserveTokens}
							min={0}
							step={1024}
							onChange={(reserveTokens) => dispatch(patch({ compaction: { reserveTokens } }))}
						/>
						<NumberField
							label={t("config.context.keepRecentTokens")}
							value={draft.compaction.keepRecentTokens}
							min={0}
							step={1024}
							onChange={(keepRecentTokens) => dispatch(patch({ compaction: { keepRecentTokens } }))}
						/>
						<TextAreaField
							label={t("config.context.customInstructions")}
							value={draft.compaction.customInstructions ?? ""}
							rows={3}
							onChange={(customInstructions) => dispatch(patch({ compaction: { customInstructions } }))}
						/>

						<ToggleField
							label={t("config.context.retryEnabled")}
							value={draft.retry.enabled}
							onChange={(enabled) => dispatch(patch({ retry: { enabled } }))}
						/>
						<NumberField
							label={t("config.context.maxRetries")}
							value={draft.retry.maxRetries}
							min={0}
							max={10}
							onChange={(maxRetries) => dispatch(patch({ retry: { maxRetries } }))}
						/>
						<NumberField
							label={t("config.context.baseDelayMs")}
							value={draft.retry.baseDelayMs}
							min={0}
							step={250}
							onChange={(baseDelayMs) => dispatch(patch({ retry: { baseDelayMs } }))}
						/>

						<Button
							type="button"
							$size="sm"
							disabled={!sessionOpen || running}
							onClick={() => dispatch(compactNow(draft.compaction.customInstructions))}
						>
							{t("config.context.compactNow")}
						</Button>
					</Section>

					{/* --- queues --------------------------------------------------- */}
					<Section>
						<SectionTitle>{t("config.section.queues")}</SectionTitle>
						<SelectField
							label={t("config.queues.steeringMode")}
							value={draft.steeringMode}
							options={queueModeOptions(t)}
							onChange={(steeringMode) => dispatch(patch({ steeringMode }))}
						/>
						<SelectField
							label={t("config.queues.followUpMode")}
							value={draft.followUpMode}
							options={queueModeOptions(t)}
							onChange={(followUpMode) => dispatch(patch({ followUpMode }))}
						/>
					</Section>

					{/* --- resources ------------------------------------------------ */}
					<Section>
						<SectionTitle>{t("config.section.resources")}</SectionTitle>
						<ListField
							label={t("config.resources.skillDirs")}
							values={draft.skillDirs}
							hint={t("config.resources.defaultHint")}
							addLabel={t("common.add")}
							removeLabel={t("common.remove")}
							onChange={(skillDirs) => dispatch(patch({ skillDirs }))}
						/>
						<ListField
							label={t("config.resources.promptTemplateDirs")}
							values={draft.promptTemplateDirs}
							addLabel={t("common.add")}
							removeLabel={t("common.remove")}
							onChange={(promptTemplateDirs) => dispatch(patch({ promptTemplateDirs }))}
						/>
						<Button type="button" $size="sm" disabled={!sessionOpen} onClick={() => dispatch(reloadResources())}>
							{t("config.resources.reload")}
						</Button>
					</Section>

					{/* --- advanced ------------------------------------------------- */}
					<Section>
						<SectionTitle>{t("config.section.advanced")}</SectionTitle>
						<SelectField
							label={t("config.advanced.transport")}
							value={draft.transport}
							options={transportOptions()}
							onChange={(transport) => dispatch(patch({ transport }))}
						/>
						<ToggleField
							label={t("config.advanced.persistSession")}
							value={draft.persistSession}
							onChange={(persistSession) => dispatch(patch({ persistSession }))}
						/>
						<ToggleField
							label={t("config.advanced.debugPayloads")}
							value={draft.debugPayloads}
							onChange={(debugPayloads) => dispatch(patch({ debugPayloads }))}
						/>
						<TextField
							label={t("config.advanced.providerSessionId")}
							value={draft.providerSessionId ?? ""}
							mono
							onChange={(providerSessionId) => dispatch(patch({ providerSessionId }))}
						/>
					</Section>
				</Stack>
			</ScrollArea>

			<StickyFooter $gap={2}>
				{dirty.length > 0 ? (
					<Badge $tone="accent">{t("config.applyPending", { count: dirty.length })}</Badge>
				) : (
					<Text $size="xs" $tone="faint">
						{running ? t("config.deferred") : ""}
					</Text>
				)}
				<Spacer />
				<ButtonRow>
					<Button
						type="button"
						$size="sm"
						disabled={dirty.length === 0}
						onClick={() => dispatch(configActions.revertDraft())}
					>
						{t("config.revert")}
					</Button>
					<Button
						type="button"
						$size="sm"
						$variant="primary"
						disabled={!sessionOpen || dirty.length === 0}
						onClick={() => dispatch(applyConfig())}
					>
						{t("config.apply")}
					</Button>
				</ButtonRow>
			</StickyFooter>
		</Frame>
	);
}
