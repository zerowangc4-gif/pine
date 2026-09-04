/**
 * Compile-time proof that the wire contract still matches the agent library.
 *
 * `@pine/protocol` declares its own structural copies of the message, event
 * and resource types so the browser never compiles provider sources. That
 * freedom is only safe if drift is caught, so this module asserts assignability
 * in the direction each type actually travels:
 *
 *  - library -> wire for everything the runtime *publishes*
 *  - wire -> library for the few values a client *supplies*
 *
 * Nothing here runs. If `@pine/agent` or `@pine/ai` changes shape, this file
 * stops compiling and `pnpm --filter @pine/runtime typecheck` fails.
 */

import type {
	AgentEvent as LibAgentEvent,
	AgentMessage as LibAgentMessage,
	PromptTemplate as LibPromptTemplate,
	QueueMode as LibQueueMode,
	Skill as LibSkill,
	ThinkingLevel as LibThinkingLevel,
	ToolExecutionMode as LibToolExecutionMode,
} from "@pine/agent";
import type {
	ImageContent as LibImageContent,
	ThinkingBudgets as LibThinkingBudgets,
	Transport as LibTransport,
	Usage as LibUsage,
} from "@pine/ai";
import type {
	AgentEvent as WireAgentEvent,
	AgentMessage as WireAgentMessage,
	ImageContent as WireImageContent,
	PromptTemplateInfo as WirePromptTemplate,
	QueueMode as WireQueueMode,
	SkillInfo as WireSkill,
	ThinkingBudgets as WireThinkingBudgets,
	ThinkingLevel as WireThinkingLevel,
	ToolExecutionMode as WireToolExecutionMode,
	Transport as WireTransport,
	Usage as WireUsage,
	UserMessage as WireUserMessage,
} from "@pine/protocol";

/**
 * `true` when `From` is assignable to `To`.
 *
 * The tuple wrappers stop TypeScript from distributing over unions, which would
 * let a single matching member satisfy the whole check.
 */
type Assignable<From, To> = [From] extends [To] ? true : { mismatch: "not assignable"; from: From; to: To };

/** Declaring the constant is the assertion; a mismatch becomes a type error. */
function assert<T extends true>(_proof: T): void {}

// ---------------------------------------------------------------------------
// Published by the runtime: library values must fit the wire types.
// ---------------------------------------------------------------------------

assert<Assignable<LibAgentMessage, WireAgentMessage>>(true);
assert<Assignable<LibAgentEvent, WireAgentEvent>>(true);
assert<Assignable<LibUsage, WireUsage>>(true);
assert<Assignable<LibSkill, WireSkill>>(true);
assert<Assignable<LibPromptTemplate, WirePromptTemplate>>(true);
assert<Assignable<LibThinkingLevel, WireThinkingLevel>>(true);
assert<Assignable<LibQueueMode, WireQueueMode>>(true);
assert<Assignable<LibToolExecutionMode, WireToolExecutionMode>>(true);
assert<Assignable<LibTransport, WireTransport>>(true);

// ---------------------------------------------------------------------------
// Supplied by clients: wire values must fit the library types.
// ---------------------------------------------------------------------------

assert<Assignable<WireImageContent, LibImageContent>>(true);
assert<Assignable<LibImageContent, WireImageContent>>(true);
assert<Assignable<WireUserMessage, LibAgentMessage>>(true);
assert<Assignable<WireThinkingLevel, LibThinkingLevel>>(true);
assert<Assignable<WireQueueMode, LibQueueMode>>(true);
assert<Assignable<WireToolExecutionMode, LibToolExecutionMode>>(true);
assert<Assignable<WireTransport, LibTransport>>(true);
assert<Assignable<WireThinkingBudgets, LibThinkingBudgets>>(true);
assert<Assignable<LibThinkingBudgets, WireThinkingBudgets>>(true);

/**
 * The one direction that is deliberately *not* assignable.
 *
 * A wire `AssistantMessage` types `api` and `provider` as plain strings, while
 * the library narrows them to generated unions. Restoring a transcript from a
 * client therefore needs a cast; `toLibraryMessages` is the only place allowed
 * to make it, so the exception stays visible in one spot.
 */
export function toLibraryMessages(messages: WireAgentMessage[]): LibAgentMessage[] {
	return messages as LibAgentMessage[];
}

/** The mirror of the above, used when publishing transcripts to clients. */
export function toWireMessages(messages: LibAgentMessage[]): WireAgentMessage[] {
	return messages;
}
