/**
 * Shared fixtures and assertions for the protocol-line test suite.
 */

import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createDefaultConfig, type AgentConfig } from "@pine/protocol";
import type { TestClient } from "./client.ts";

export const MODEL_PORT = 7999;
export const SERVER_PORT = 7822;

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

const failures: string[] = [];
let checks = 0;

export function expect(condition: boolean, label: string): void {
	checks += 1;
	if (condition) {
		console.log(`  ok   ${label}`);
	} else {
		failures.push(label);
		console.log(`  FAIL ${label}`);
	}
}

/** Print a section header labeled with a protocol line name (or scenario title). */
export function section(name: string): void {
	console.log(`\n--- ${name} ---`);
}

export function getResults(): { checks: number; failures: string[] } {
	return { checks, failures };
}

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

export const workspace = mkdtempSync(join(tmpdir(), "pine-test-"));
export const otherWorkspace = mkdtempSync(join(tmpdir(), "pine-other-"));
process.env.PINE_SESSIONS_ROOT = mkdtempSync(join(tmpdir(), "pine-sessions-"));

writeFileSync(join(workspace, "notes.txt"), "hello from pine.\n", "utf8");
// Sized to sit under the read tool's own 50KB / 2000-line cap but well above
// the session's `maxToolResultBytes`, so `afterToolCall` is what truncates it.
writeFileSync(join(workspace, "big.txt"), `${"lorem ipsum dolor sit amet consectetur\n".repeat(1000)}`, "utf8");
writeFileSync(join(otherWorkspace, "elsewhere.txt"), "a different tree.\n", "utf8");

mkdirSync(join(workspace, ".pine", "skills", "greet"), { recursive: true });
writeFileSync(
	join(workspace, ".pine", "skills", "greet", "SKILL.md"),
	"---\nname: greet\ndescription: Say hello politely\n---\n\nGreet the user warmly.\n",
	"utf8",
);
mkdirSync(join(workspace, ".pine", "commands"), { recursive: true });
writeFileSync(join(workspace, ".pine", "commands", "summarize.md"), "Summarize $1 in one sentence.\n", "utf8");

export function baseConfig(overrides: Partial<AgentConfig> = {}): AgentConfig {
	const config = createDefaultConfig(workspace);
	config.model = {
		...config.model,
		api: "openai-completions",
		providerId: "smoke",
		modelId: "smoke-model",
		baseUrl: `http://127.0.0.1:${MODEL_PORT}/v1`,
		contextWindow: 32_000,
		maxTokens: 1024,
	};
	config.apiKey = "smoke-key";
	config.approvalPolicy = "auto";
	config.tools = config.tools.map((tool) => ({ ...tool, enabled: tool.name !== "finish" }));
	return { ...config, ...overrides };
}

/** Open a session, run a body against it, and always close it afterwards. */
export async function withSession(
	client: TestClient,
	config: AgentConfig,
	body: (sessionId: string) => Promise<void>,
): Promise<void> {
	const opened = await client.request("session:open", { config });
	try {
		await body(opened.state.sessionId);
	} finally {
		await client.request("session:close", opened.state.sessionId).catch(() => undefined);
	}
}
