/**
 * Auto-compaction on top of `Agent.transformContext`.
 *
 * The compaction helpers in `@pine/agent` operate on session `Entry[]`, while
 * `transformContext` receives `AgentMessage[]`. A "fold" bridges the two: the
 * summary of everything before a cut point, plus how many leading transcript
 * messages that summary replaces. Rebuilding a synthetic entry list from the
 * fold lets `prepareCompaction` see the previous summary, so repeated
 * compactions chain instead of restarting from scratch.
 */

import {
	buildSessionContext,
	compact,
	prepareCompaction,
	type AgentMessage,
	type CompactionSettings,
	type Entry,
	type ThinkingLevel,
} from "@pine/agent";
import type { Api, Model, Models, RetryPolicy, Usage } from "@pine/ai";

export interface CompactionFold {
	generation: number;
	summary: string;
	tokensBefore: number;
	/** Number of leading transcript messages the summary stands in for. */
	foldedCount: number;
	createdAt: number;
	retainedTail: AgentMessage[];
	usage?: Usage;
}

function messageTimestamp(message: AgentMessage, fallback: number): number {
	const candidate = (message as { timestamp?: unknown }).timestamp;
	return typeof candidate === "number" && Number.isFinite(candidate) ? candidate : fallback;
}

/** A fold is stale once the transcript it was computed against has shrunk. */
export function isFoldApplicable(fold: CompactionFold | undefined, messages: AgentMessage[]): boolean {
	return fold !== undefined && messages.length >= fold.foldedCount;
}

/** Synthetic branch entries: an optional compaction entry followed by the live tail. */
export function buildFoldEntries(fold: CompactionFold | undefined, messages: AgentMessage[]): Entry[] {
	const active = isFoldApplicable(fold, messages) ? fold : undefined;
	const entries: Entry[] = [];
	const now = Date.now();
	let seq = 0;
	let parentId: string | null = null;

	if (active) {
		const id = `pine-compaction-${active.generation}`;
		entries.push({
			type: "compaction",
			id,
			seq: seq++,
			parentId,
			timestamp: active.createdAt,
			summary: active.summary,
			// The tail lives in the message entries below, so it must not be duplicated here.
			retainedTail: [],
			tokensBefore: active.tokensBefore,
		});
		parentId = id;
	}

	const tail = active ? messages.slice(active.foldedCount) : messages;
	for (let index = 0; index < tail.length; index++) {
		const id = `pine-message-${active?.generation ?? 0}-${index}`;
		entries.push({
			type: "message",
			id,
			seq: seq++,
			parentId,
			timestamp: messageTimestamp(tail[index], now),
			message: tail[index],
		});
		parentId = id;
	}

	return entries;
}

/** The transcript as the model should see it: summary in place of the folded prefix. */
export function foldedMessages(fold: CompactionFold | undefined, messages: AgentMessage[]): AgentMessage[] {
	if (!isFoldApplicable(fold, messages)) return messages;
	return buildSessionContext(buildFoldEntries(fold, messages)).messages;
}

export interface RunCompactionOptions {
	fold: CompactionFold | undefined;
	messages: AgentMessage[];
	models: Models;
	model: Model<Api>;
	settings: CompactionSettings;
	customInstructions?: string;
	thinkingLevel?: ThinkingLevel;
	retry?: RetryPolicy;
	signal?: AbortSignal;
}

export type CompactionOutcome =
	| { kind: "nothing-to-compact" }
	| { kind: "failed"; message: string }
	| { kind: "compacted"; fold: CompactionFold };

export async function runCompaction(options: RunCompactionOptions): Promise<CompactionOutcome> {
	const entries = buildFoldEntries(options.fold, options.messages);
	const preparation = prepareCompaction(entries, options.settings);
	if (!preparation.ok) return { kind: "failed", message: preparation.error.message };
	if (preparation.value === undefined) return { kind: "nothing-to-compact" };
	if (preparation.value.messagesToSummarize.length === 0 && preparation.value.turnPrefixMessages.length === 0) {
		return { kind: "nothing-to-compact" };
	}

	const result = await compact(
		preparation.value,
		options.models,
		options.model,
		options.customInstructions,
		options.signal,
		options.thinkingLevel === "off" ? undefined : options.thinkingLevel,
		options.retry,
	);
	if (!result.ok) return { kind: "failed", message: result.error.message };

	const { summary, tokensBefore, retainedTail, usage } = result.value;
	const foldedCount = Math.max(0, options.messages.length - retainedTail.length);

	return {
		kind: "compacted",
		fold: {
			generation: (options.fold?.generation ?? 0) + 1,
			summary,
			tokensBefore,
			foldedCount,
			createdAt: Date.now(),
			retainedTail,
			usage,
		},
	};
}
