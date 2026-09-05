/**
 * Tool construction for a session.
 *
 * Harness tools take an extra `context` argument, so each one is bound to the
 * session's shared `ExecutionEnv` before being handed to the agent. Binding
 * preserves `prepareArguments` and `executionMode`, both of which the agent
 * loop honors.
 */

import {
	type AgentHarnessTool,
	type AgentTool,
	type AgentToolResult,
	createBashTool,
	createEditTool,
	createReadTool,
	createWriteTool,
	type ExecutionEnv,
	type ExecutionToolContext,
	type ToolExecutionMode,
} from "@pine/agent";
import { type TSchema, Type } from "@pine/ai";
import { READ_ONLY_TOOL_NAMES, type ToolName, type ToolSetting } from "@pine/protocol";

function bindTool<TParameters extends TSchema>(
	tool: AgentHarnessTool<ExecutionToolContext, TParameters, any>,
	context: ExecutionToolContext,
	executionMode: ToolExecutionMode | undefined,
): AgentTool<TParameters> {
	const resolvedMode = executionMode ?? tool.executionMode;
	return {
		name: tool.name,
		label: tool.label,
		description: tool.description,
		parameters: tool.parameters,
		...(tool.prepareArguments ? { prepareArguments: tool.prepareArguments } : {}),
		...(resolvedMode ? { executionMode: resolvedMode } : {}),
		execute: (toolCallId, params, signal, onUpdate) => tool.execute(toolCallId, params, signal, onUpdate, context),
	};
}

const finishSchema = Type.Object({
	summary: Type.String({ description: "Short summary of what was accomplished." }),
});

/**
 * Ends the run after the current tool batch.
 *
 * Exercises `AgentToolResult.terminate`: the agent loop stops instead of
 * starting another turn when every result in the batch sets it.
 */
function createFinishTool(): AgentTool<typeof finishSchema> {
	return {
		name: "finish",
		label: "finish",
		description:
			"Declare the task complete and stop. Call this alone, with no other tool calls in the same message, once the work is done and verified.",
		parameters: finishSchema,
		executionMode: "sequential",
		execute: async (_toolCallId, { summary }): Promise<AgentToolResult<{ summary: string }>> => ({
			content: [{ type: "text", text: `Task marked complete: ${summary}` }],
			details: { summary },
			terminate: true,
		}),
	};
}

export interface BuildToolsOptions {
	env: ExecutionEnv;
	settings: ToolSetting[];
	bashCommandPrefix?: string;
	/** Extra environment variables exported to every bash command. */
	bashEnv?: Record<string, string>;
}

export interface ToolDescriptor {
	name: ToolName;
	label: string;
	description: string;
	enabled: boolean;
	readOnly: boolean;
}

export interface BuiltTools {
	tools: AgentTool<any>[];
	descriptors: ToolDescriptor[];
}

export function buildTools(options: BuildToolsOptions): BuiltTools {
	const context: ExecutionToolContext = { env: options.env };
	const modeFor = (name: ToolName): ToolExecutionMode | undefined =>
		options.settings.find((setting) => setting.name === name)?.executionMode;
	const enabledFor = (name: ToolName): boolean =>
		options.settings.find((setting) => setting.name === name)?.enabled ?? false;

	const available: { name: ToolName; tool: AgentTool<any> }[] = [
		{ name: "read", tool: bindTool(createReadTool(), context, modeFor("read")) },
		{ name: "write", tool: bindTool(createWriteTool(), context, modeFor("write")) },
		{ name: "edit", tool: bindTool(createEditTool(), context, modeFor("edit")) },
		{
			name: "bash",
			tool: bindTool(
				createBashTool({
					commandPrefix: options.bashCommandPrefix?.trim() || undefined,
					prepare: (execution) => {
						execution.cwd = options.env.cwd;
						Object.assign(execution.env, options.bashEnv ?? {});
					},
				}),
				context,
				modeFor("bash"),
			),
		},
		{ name: "finish", tool: createFinishTool() },
	];

	const descriptors = available.map(({ name, tool }) => ({
		name,
		label: tool.label,
		description: tool.description,
		enabled: enabledFor(name),
		readOnly: READ_ONLY_TOOL_NAMES.includes(name),
	}));

	return {
		tools: available.filter(({ name }) => enabledFor(name)).map(({ tool }) => tool),
		descriptors,
	};
}

/** Short human-readable description of a tool call, for approval prompts. */
export function summarizeToolCall(toolName: string, args: unknown): string {
	if (args === null || typeof args !== "object") return toolName;
	const record = args as Record<string, unknown>;
	switch (toolName) {
		case "bash":
			return typeof record.command === "string" ? record.command : toolName;
		case "read":
		case "write":
			return typeof record.path === "string" ? record.path : toolName;
		case "edit": {
			const edits = Array.isArray(record.edits) ? record.edits.length : 0;
			return typeof record.path === "string" ? `${record.path} (${edits} edit${edits === 1 ? "" : "s"})` : toolName;
		}
		case "finish":
			return typeof record.summary === "string" ? record.summary : toolName;
		default:
			return toolName;
	}
}

/** Flatten the text parts of a tool result for previews and logs. */
export function toolResultText(result: AgentToolResult<unknown>): string {
	return (result.content ?? [])
		.filter((part): part is { type: "text"; text: string } => part.type === "text")
		.map((part) => part.text)
		.join("\n");
}
