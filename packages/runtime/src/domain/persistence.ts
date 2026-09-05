/**
 * JSONL-backed session persistence.
 *
 * The agent itself is stateless across restarts, so the runtime mirrors the
 * transcript and the configuration changes that matter for replay into a
 * `Session`. Reopening a session rebuilds `Agent.state.messages` through
 * `buildSessionContext`, which also folds compaction entries.
 */

import { homedir } from "node:os";
import { join } from "node:path";
import {
	type AgentMessage,
	buildSessionContext,
	type Entry,
	type JsonlSessionMetadata,
	JsonlSessionRepo,
	type Session,
	type ThinkingLevel,
	uuidv7,
} from "@pine/agent";
import { NodeExecutionEnv } from "@pine/agent/node";
import type { Usage } from "@pine/ai";
import type { StoredSessionInfo } from "@pine/protocol";

/** Where transcripts live. Mirrors the coding-agent layout so files stay portable. */
export function defaultSessionsRoot(): string {
	return process.env.PINE_SESSIONS_ROOT?.trim() || join(homedir(), ".pine", "sessions");
}

/**
 * Strip values the session layer refuses to store.
 *
 * `assertJsonSerializable` rejects `undefined` and non-finite numbers anywhere
 * in the payload, and provider messages routinely carry optional fields, so
 * everything is normalized through a JSON round-trip first.
 */
export function toStorableJson<T>(value: T): T {
	return JSON.parse(
		JSON.stringify(value, (_key, item) => (typeof item === "number" && !Number.isFinite(item) ? null : item)),
	) as T;
}

export interface SessionStoreOptions {
	sessionsRoot?: string;
}

/** Thin wrapper that owns the repo and the filesystem it reads through. */
export class SessionStore {
	private readonly repo: JsonlSessionRepo;
	private readonly fs: NodeExecutionEnv;
	readonly sessionsRoot: string;

	constructor(options: SessionStoreOptions = {}) {
		this.sessionsRoot = options.sessionsRoot ?? defaultSessionsRoot();
		this.fs = new NodeExecutionEnv({ cwd: this.sessionsRoot });
		this.repo = new JsonlSessionRepo({ fs: this.fs, sessionsRoot: this.sessionsRoot });
	}

	async create(
		cwd: string,
		id?: string,
		options: { parentSessionId?: string } = {},
	): Promise<{ session: Session<JsonlSessionMetadata>; path: string }> {
		const session = await this.repo.create({
			cwd,
			id: id ?? uuidv7(),
			...(options.parentSessionId ? { parentSessionId: options.parentSessionId } : {}),
		});
		const metadata = await session.getMetadata();
		return { session, path: metadata.path };
	}

	async open(sessionId: string): Promise<{ session: Session<JsonlSessionMetadata>; path: string } | undefined> {
		const metadata = (await this.repo.list()).find((candidate) => candidate.id === sessionId);
		if (!metadata) return undefined;
		const session = await this.repo.open(metadata);
		return { session, path: metadata.path };
	}

	async delete(sessionId: string): Promise<boolean> {
		const metadata = (await this.repo.list()).find((candidate) => candidate.id === sessionId);
		if (!metadata) return false;
		await this.repo.delete(metadata);
		return true;
	}

	/**
	 * Start a fresh transcript for an existing live session id.
	 *
	 * The JSONL log is append-only, so reset/truncate/setMessages continue in a
	 * new file. The previous file is forked under a new id (parent-linked) and
	 * the original id is recreated empty, so UI resume keeps working.
	 */
	async rotate(
		cwd: string,
		sessionId: string,
	): Promise<{ session: Session<JsonlSessionMetadata>; path: string; archivedId?: string }> {
		const existing = (await this.repo.list()).find((candidate) => candidate.id === sessionId);
		let archivedId: string | undefined;
		if (existing) {
			archivedId = uuidv7();
			await this.repo.fork(existing, {
				scope: "tree",
				id: archivedId,
				cwd,
				parentSessionId: sessionId,
			});
			await this.repo.delete(existing);
		}
		const session = await this.repo.create({
			cwd,
			id: sessionId,
			...(archivedId ? { parentSessionId: archivedId } : {}),
		});
		const metadata = await session.getMetadata();
		return { session, path: metadata.path, ...(archivedId ? { archivedId } : {}) };
	}

	/** Most recently modified sessions, newest first, with stats where readable. */
	async list(cwd?: string, limit = 50): Promise<StoredSessionInfo[]> {
		const all = await this.repo.list(cwd === undefined ? {} : { cwd });
		const infos: StoredSessionInfo[] = [];
		for (const metadata of all.slice(0, limit)) {
			const info: StoredSessionInfo = {
				sessionId: metadata.id,
				path: metadata.path,
				cwd: metadata.cwd,
				createdAt: metadata.createdAt,
				modifiedAt: metadata.modifiedAt,
				messageCount: 0,
				totalTokens: 0,
				costTotal: 0,
			};
			try {
				const session = await this.repo.open(metadata);
				const stats = await session.getStats();
				info.messageCount = stats.messageCount;
				info.totalTokens = stats.totalTokens;
				info.costTotal = stats.costTotal;
				info.label = await session.getName();
			} catch {
				// A truncated or half-written transcript should still be listable.
			}
			infos.push(info);
		}
		return infos;
	}

	/**
	 * Distinct workspace roots seen in stored transcripts, most recent first.
	 *
	 * Backs the "recent workspaces" shortcut in the picker. Reads metadata only,
	 * so it stays cheap even with a large session history.
	 */
	async recentWorkspaces(limit = 12): Promise<string[]> {
		const all = await this.repo.list();
		const seen = new Set<string>();
		const roots: string[] = [];
		for (const metadata of all) {
			if (!metadata.cwd || seen.has(metadata.cwd)) continue;
			seen.add(metadata.cwd);
			roots.push(metadata.cwd);
			if (roots.length >= limit) break;
		}
		return roots;
	}
}

/** Entries on the current branch, oldest first. */
export async function readBranchEntries(session: Session<JsonlSessionMetadata>): Promise<Entry[]> {
	const leafId = await session.getLeafId();
	if (!leafId) return [];
	return session.findEntriesOnBranch({ start: leafId, order: "oldestFirst" });
}

export interface RestoredSession {
	messages: AgentMessage[];
	thinkingLevel?: ThinkingLevel;
	model?: { provider: string; modelId: string };
	activeToolNames?: string[];
}

/** Rebuild agent state from a persisted transcript. */
export async function restoreSession(session: Session<JsonlSessionMetadata>): Promise<RestoredSession> {
	const entries = await readBranchEntries(session);
	const context = buildSessionContext(entries);
	return {
		messages: context.messages,
		thinkingLevel: context.thinkingLevel as ThinkingLevel,
		model: context.model ?? undefined,
		activeToolNames: context.activeToolNames ?? undefined,
	};
}

export async function appendMessageEntry(session: Session<JsonlSessionMetadata>, message: AgentMessage): Promise<void> {
	await session.appendMessage(toStorableJson(message));
}

export async function appendModelChange(
	session: Session<JsonlSessionMetadata>,
	provider: string,
	modelId: string,
): Promise<void> {
	await session.appendEntry({ type: "model_change", id: uuidv7(), provider, modelId }, "main");
}

export async function appendThinkingLevelChange(
	session: Session<JsonlSessionMetadata>,
	thinkingLevel: string,
): Promise<void> {
	await session.appendEntry({ type: "thinking_level_change", id: uuidv7(), thinkingLevel }, "main");
}

export async function appendActiveToolsChange(
	session: Session<JsonlSessionMetadata>,
	activeToolNames: string[],
): Promise<void> {
	await session.appendEntry({ type: "active_tools_change", id: uuidv7(), activeToolNames }, "main");
}

export async function appendCompactionEntry(
	session: Session<JsonlSessionMetadata>,
	compaction: {
		summary: string;
		retainedTail: AgentMessage[];
		tokensBefore: number;
		usage?: Usage;
		details?: unknown;
	},
): Promise<void> {
	await session.appendEntry(
		{
			type: "compaction",
			id: uuidv7(),
			summary: compaction.summary,
			retainedTail: toStorableJson(compaction.retainedTail),
			tokensBefore: compaction.tokensBefore,
			...(compaction.usage ? { usage: toStorableJson(compaction.usage) } : {}),
			...(compaction.details === undefined ? {} : { details: toStorableJson(compaction.details) }),
		},
		"main",
	);
}
