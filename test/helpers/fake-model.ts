/**
 * Scriptable OpenAI-compatible SSE server for the smoke tests.
 *
 * Lets a test drive the agent loop deterministically — tool call, then answer,
 * then stop — without a network dependency or a real model's variability.
 */

import { createServer, type Server } from "node:http";

/** One scripted assistant response. */
export type FakeTurn =
	| { kind: "text"; text: string }
	| { kind: "toolCall"; id: string; name: string; args: unknown }
	/** Streams a 500 so retry and error paths can be exercised. */
	| { kind: "error"; status: number; message: string };

export interface FakeModel {
	readonly port: number;
	/** How many provider requests have arrived so far. */
	readonly calls: number;
	/** Bodies received, for asserting on what the agent actually sent. */
	readonly payloads: Record<string, unknown>[];
	/** Replace the script. Turns are consumed in order; the last one repeats. */
	script(turns: FakeTurn[]): void;
	close(): Promise<void>;
}

function sse(payload: unknown): string {
	return `data: ${JSON.stringify(payload)}\n\n`;
}

export async function startFakeModel(port: number): Promise<FakeModel> {
	let turns: FakeTurn[] = [{ kind: "text", text: "ok" }];
	let calls = 0;
	const payloads: Record<string, unknown>[] = [];

	const server: Server = createServer((request, response) => {
		let body = "";
		request.on("data", (chunk) => {
			body += chunk;
		});

		request.on("end", () => {
			calls += 1;
			try {
				payloads.push(JSON.parse(body) as Record<string, unknown>);
			} catch {
				payloads.push({});
			}

			// Past the end of the script the final turn repeats, which keeps a loop
			// that runs longer than expected from hanging the test.
			const turn = turns[Math.min(calls - 1, turns.length - 1)] ?? { kind: "text", text: "ok" };

			if (turn.kind === "error") {
				response.writeHead(turn.status, { "content-type": "application/json" });
				response.end(JSON.stringify({ error: { message: turn.message } }));
				return;
			}

			response.writeHead(200, {
				"content-type": "text/event-stream",
				"cache-control": "no-cache",
				connection: "keep-alive",
			});

			const base = { id: `chatcmpl-${calls}`, object: "chat.completion.chunk", created: 0, model: "smoke-model" };
			const choice = (delta: unknown, finish: string | null): string =>
				sse({ ...base, choices: [{ index: 0, delta, finish_reason: finish }] });

			response.write(choice({ role: "assistant", content: "" }, null));

			if (turn.kind === "toolCall") {
				response.write(
					choice(
						{
							tool_calls: [
								{
									index: 0,
									id: turn.id,
									type: "function",
									function: { name: turn.name, arguments: JSON.stringify(turn.args) },
								},
							],
						},
						null,
					),
				);
				response.write(choice({}, "tool_calls"));
			} else {
				// Split the text so the client exercises incremental `message_update`.
				for (const piece of turn.text.match(/.{1,12}/gs) ?? [turn.text]) {
					response.write(choice({ content: piece }, null));
				}
				response.write(choice({}, "stop"));
			}

			response.write(sse({ ...base, choices: [], usage: { prompt_tokens: 120, completion_tokens: 18, total_tokens: 138 } }));
			response.write("data: [DONE]\n\n");
			response.end();
		});
	});

	await new Promise<void>((done) => server.listen(port, "127.0.0.1", done));

	return {
		port,
		get calls() {
			return calls;
		},
		payloads,
		script: (next) => {
			turns = next;
			calls = 0;
			payloads.length = 0;
		},
		close: () => new Promise<void>((done) => server.close(() => done())),
	};
}
