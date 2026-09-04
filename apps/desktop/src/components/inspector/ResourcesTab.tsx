/**
 * Skills, prompt templates and tools discovered for the current workspace.
 *
 * Both skills and templates are runnable from here, which is the only place in
 * the UI that reaches `Agent.prompt` with a prebuilt message rather than free
 * text. Load problems are shown rather than swallowed: a malformed SKILL.md is
 * otherwise invisible.
 */

import { useState } from "react";
import { useTranslate } from "../../i18n/useTranslate.ts";
import { reloadResources, runSkill, runTemplate } from "../../store/actions/session.ts";
import { useAppDispatch, useAppSelector } from "../../store/hooks.ts";
import { selectIsRunning, selectResources } from "../../store/slices/session.ts";
import { Button, ButtonRow } from "../primitives/Button.tsx";
import { TextField } from "../primitives/Field.tsx";
import { Badge, Divider, EmptyState, Panel, Row, Spacer, Stack, Text } from "../primitives/Surface.tsx";

export function ResourcesTab() {
	const t = useTranslate();
	const dispatch = useAppDispatch();
	const resources = useAppSelector(selectResources);
	const running = useAppSelector(selectIsRunning);

	/** Extra instructions / arguments, keyed by resource name. */
	const [inputs, setInputs] = useState<Record<string, string>>({});
	const setInput = (name: string, value: string): void => setInputs((current) => ({ ...current, [name]: value }));

	if (!resources) return <EmptyState>{t("session.none")}</EmptyState>;

	const nothing =
		resources.skills.length === 0 && resources.promptTemplates.length === 0 && resources.diagnostics.length === 0;

	return (
		<Stack $gap={4}>
			<Row>
				<Button type="button" $size="sm" onClick={() => dispatch(reloadResources())}>
					{t("config.resources.reload")}
				</Button>
			</Row>

			{nothing ? <EmptyState>{t("inspector.resources.empty")}</EmptyState> : null}

			{resources.skills.length > 0 ? (
				<Stack $gap={2}>
					<Text $size="xs" $tone="muted" $weight="semibold">
						{t("inspector.resources.skills")}
					</Text>
					{resources.skills.map((skill) => (
						<Panel key={skill.name} $padding={3}>
							<Stack $gap={2}>
								<Row $gap={2}>
									<Text $size="sm" $mono $weight="medium">
										{skill.name}
									</Text>
									{skill.disableModelInvocation ? <Badge>manual</Badge> : null}
								</Row>
								<Text $size="xs" $tone="muted">
									{skill.description}
								</Text>
								<Row $gap={2}>
									<TextField
										label={t("approval.reason")}
										value={inputs[skill.name] ?? ""}
										onChange={(value) => setInput(skill.name, value)}
									/>
								</Row>
								<Row>
									<Spacer />
									<Button
										type="button"
										$size="sm"
										disabled={running}
										onClick={() => dispatch(runSkill(skill.name, inputs[skill.name]))}
									>
										{t("inspector.resources.run")}
									</Button>
								</Row>
							</Stack>
						</Panel>
					))}
				</Stack>
			) : null}

			{resources.promptTemplates.length > 0 ? (
				<Stack $gap={2}>
					<Text $size="xs" $tone="muted" $weight="semibold">
						{t("inspector.resources.templates")}
					</Text>
					{resources.promptTemplates.map((template) => (
						<Panel key={template.name} $padding={3}>
							<Stack $gap={2}>
								<Text $size="sm" $mono $weight="medium">
									{template.name}
								</Text>
								{template.description ? (
									<Text $size="xs" $tone="muted">
										{template.description}
									</Text>
								) : null}
								<TextField
									label={t("inspector.resources.args")}
									value={inputs[`t:${template.name}`] ?? ""}
									onChange={(value) => setInput(`t:${template.name}`, value)}
								/>
								<Row>
									<Spacer />
									<Button
										type="button"
										$size="sm"
										disabled={running}
										onClick={() =>
											dispatch(
												runTemplate(
													template.name,
													// One argument per line, matching the field's own hint.
													(inputs[`t:${template.name}`] ?? "")
														.split("\n")
														.map((line) => line.trim())
														.filter(Boolean),
												),
											)
										}
									>
										{t("inspector.resources.run")}
									</Button>
								</Row>
							</Stack>
						</Panel>
					))}
				</Stack>
			) : null}

			<Divider $spacing={0} />

			<Stack $gap={2}>
				<Text $size="xs" $tone="muted" $weight="semibold">
					{t("inspector.resources.tools")}
				</Text>
				{resources.tools.map((tool) => (
					<Row key={tool.name} $gap={2}>
						<Badge $tone={tool.enabled ? "success" : "neutral"}>{tool.enabled ? "on" : "off"}</Badge>
						<Text $size="sm" $mono>
							{tool.name}
						</Text>
						{tool.readOnly ? <Badge>{t("approval.readOnly")}</Badge> : null}
						<Text $size="xs" $tone="faint" $truncate>
							{tool.label}
						</Text>
					</Row>
				))}
			</Stack>

			{resources.diagnostics.length > 0 ? (
				<Stack $gap={2}>
					<Text $size="xs" $tone="warning" $weight="semibold">
						{t("inspector.resources.diagnostics")}
					</Text>
					{resources.diagnostics.map((diagnostic, index) => (
						// eslint-disable-next-line react/no-array-index-key
						<Stack key={index} $gap={1}>
							<Text $size="xs" $tone="warning">
								{diagnostic.source}: {diagnostic.message}
							</Text>
							<Text $size="xs" $mono $tone="faint" $truncate>
								{diagnostic.path}
							</Text>
						</Stack>
					))}
				</Stack>
			) : null}
		</Stack>
	);
}
