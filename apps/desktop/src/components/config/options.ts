/**
 * Localized option lists for the configuration selects.
 *
 * Kept out of the panel so the enumerations stay in one place: adding a value
 * to the protocol means adding it here, and the compiler points at the missing
 * label because the option arrays are exhaustive over the protocol's unions.
 */

import {
	APPROVAL_POLICIES,
	type ApprovalPolicy,
	QUEUE_MODES,
	type QueueMode,
	SUPPORTED_APIS,
	type SupportedApi,
	THINKING_LEVELS,
	type ThinkingLevel,
	TOOL_EXECUTION_MODES,
	type ToolExecutionMode,
	type ToolName,
	TRANSPORTS,
	type Transport,
} from "@pine/protocol";
import type { Translate } from "../../i18n/index.ts";
import type { SelectOption } from "../primitives/Field.tsx";

/** API protocols read the same in both languages, so they are shown verbatim. */
export function apiOptions(): SelectOption<SupportedApi>[] {
	return SUPPORTED_APIS.map((api) => ({ value: api, label: api }));
}

export function transportOptions(): SelectOption<Transport>[] {
	return TRANSPORTS.map((transport) => ({ value: transport, label: transport }));
}

/** Levels the current model actually accepts; the rest would be clamped away. */
export function thinkingOptions(supported: ThinkingLevel[]): SelectOption<ThinkingLevel>[] {
	const allowed = supported.length > 0 ? supported : (["off"] as ThinkingLevel[]);
	return THINKING_LEVELS.filter((level) => allowed.includes(level)).map((level) => ({
		value: level,
		label: level,
	}));
}

export function approvalOptions(t: Translate): SelectOption<ApprovalPolicy>[] {
	const labels: Record<ApprovalPolicy, string> = {
		auto: t("config.approvals.policy.auto"),
		"ask-writes": t("config.approvals.policy.askWrites"),
		ask: t("config.approvals.policy.ask"),
		readonly: t("config.approvals.policy.readonly"),
	};
	return APPROVAL_POLICIES.map((policy) => ({ value: policy, label: labels[policy] }));
}

export function queueModeOptions(t: Translate): SelectOption<QueueMode>[] {
	const labels: Record<QueueMode, string> = {
		all: t("config.queues.mode.all"),
		"one-at-a-time": t("config.queues.mode.oneAtATime"),
	};
	return QUEUE_MODES.map((mode) => ({ value: mode, label: labels[mode] }));
}

export function executionModeOptions(): SelectOption<ToolExecutionMode>[] {
	return TOOL_EXECUTION_MODES.map((mode) => ({ value: mode, label: mode }));
}

/** Per-tool override, with an explicit "inherit the session default" entry. */
export function toolExecutionOverrideOptions(t: Translate): SelectOption<ToolExecutionMode | "">[] {
	return [
		{ value: "", label: t("config.tools.inherit") },
		...TOOL_EXECUTION_MODES.map((mode) => ({ value: mode, label: mode })),
	];
}

export function toolLabel(t: Translate, name: ToolName): string {
	const labels: Record<ToolName, string> = {
		read: t("config.tools.read"),
		write: t("config.tools.write"),
		edit: t("config.tools.edit"),
		bash: t("config.tools.bash"),
		finish: t("config.tools.finish"),
	};
	return labels[name];
}
