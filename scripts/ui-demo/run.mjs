/**
 * One-shot UI demo: start runtime + Vite if needed, then run the Playwright tour.
 *
 *   DEEPSEEK_API_KEY=sk-... pnpm demo:ui
 */

import { spawn } from "node:child_process";
import { createConnection } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { requireDeepseekKey } from "./load-env.mjs";

requireDeepseekKey();

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const RUNTIME_PORT = Number(process.env.PINE_RUNTIME_PORT ?? 7821);
const UI_PORT = Number(process.env.PINE_UI_PORT ?? 5173);
const UI_URL = process.env.PINE_UI_URL?.trim() || `http://127.0.0.1:${UI_PORT}/`;

const children = [];

function portOpen(port) {
	return new Promise((resolve) => {
		const socket = createConnection({ host: "127.0.0.1", port });
		socket.once("connect", () => {
			socket.end();
			resolve(true);
		});
		socket.once("error", () => resolve(false));
	});
}

async function waitForPort(port, label, timeoutMs = 90_000) {
	const start = Date.now();
	while (Date.now() - start < timeoutMs) {
		if (await portOpen(port)) return;
		await new Promise((r) => setTimeout(r, 400));
	}
	throw new Error(`等待 ${label}（端口 ${port}）超时`);
}

function start(script) {
	const child = spawn("pnpm", ["run", script], {
		cwd: root,
		stdio: "inherit",
		shell: true,
		env: process.env,
	});
	children.push(child);
	child.on("exit", (code, signal) => {
		if (signal !== "SIGTERM" && code && code !== 0) {
			console.error(`[demo:ui] ${script} 退出 code=${code}`);
		}
	});
	return child;
}

function stopChildren() {
	for (const child of children) {
		try {
			if (!child.killed) child.kill("SIGTERM");
		} catch {
			/* ignore */
		}
	}
}

async function main() {
	const needRuntime = !(await portOpen(RUNTIME_PORT));
	const needUi = !(await portOpen(UI_PORT));

	if (needRuntime) {
		console.log(`[demo:ui] 启动 runtime → :${RUNTIME_PORT}`);
		start("dev:runtime");
	} else {
		console.log(`[demo:ui] 复用已有 runtime :${RUNTIME_PORT}`);
	}
	if (needUi) {
		console.log(`[demo:ui] 启动 UI → :${UI_PORT}`);
		start("dev:ui");
	} else {
		console.log(`[demo:ui] 复用已有 UI :${UI_PORT}`);
	}

	await waitForPort(RUNTIME_PORT, "runtime");
	await waitForPort(UI_PORT, "UI");
	console.log(`[demo:ui] 服务就绪，开始 Playwright 演示 → ${UI_URL}`);

	const tour = spawn("pnpm", ["exec", "tsx", "scripts/ui-demo/deepseek-tour.mjs"], {
		cwd: root,
		stdio: "inherit",
		shell: true,
		env: { ...process.env, PINE_UI_URL: UI_URL },
	});

	const code = await new Promise((resolve) => {
		tour.on("exit", (exitCode, signal) => resolve(signal ? 1 : (exitCode ?? 1)));
	});

	stopChildren();
	process.exit(code);
}

process.on("SIGINT", () => {
	stopChildren();
	process.exit(130);
});
process.on("SIGTERM", () => {
	stopChildren();
	process.exit(143);
});

main().catch((error) => {
	console.error("[demo:ui]", error);
	stopChildren();
	process.exit(1);
});
