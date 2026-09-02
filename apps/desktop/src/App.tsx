import { useEffect, useMemo, useRef, useState } from "react";
import type { ClientMessage, ModelConfig, ServerMessage } from "@pine/protocol";

type ChatRole = "user" | "assistant" | "error" | "tool";

interface ChatMessage {
	id: string;
	role: ChatRole;
	text: string;
}

const STORAGE_KEY = "pine.model-config";

const DEFAULT_CONFIG: ModelConfig = {
	modelId: "deepseek-chat",
	baseUrl: "https://api.deepseek.com/v1",
	apiKey: "",
	cwd: "E:\\agents\\pine",
};

function loadConfig(): ModelConfig {
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return DEFAULT_CONFIG;
		return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
	} catch {
		return DEFAULT_CONFIG;
	}
}

function nextId(): string {
	return crypto.randomUUID();
}

export function App() {
	const [config, setConfig] = useState<ModelConfig>(() => loadConfig());
	const [connected, setConnected] = useState(false);
	const [busy, setBusy] = useState(false);
	const [input, setInput] = useState("");
	const [messages, setMessages] = useState<ChatMessage[]>([]);
	const wsRef = useRef<WebSocket | null>(null);
	const assistantIdRef = useRef<string | null>(null);
	const bottomRef = useRef<HTMLDivElement | null>(null);

	const statusLabel = useMemo(() => (connected ? "已连接 runtime" : "未连接 runtime"), [connected]);

	useEffect(() => {
		localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
	}, [config]);

	useEffect(() => {
		bottomRef.current?.scrollIntoView({ behavior: "smooth" });
	}, [messages]);

	useEffect(() => {
		let disposed = false;
		let retryTimer: number | undefined;
		let active: WebSocket | undefined;

		const connect = () => {
			if (disposed) return;

			const socket = new WebSocket("ws://127.0.0.1:7821");
			active = socket;
			wsRef.current = socket;

			socket.onopen = () => {
				if (disposed || wsRef.current !== socket) return;
				setConnected(true);
			};

			socket.onclose = () => {
				if (wsRef.current === socket) {
					wsRef.current = null;
					setConnected(false);
				}
				if (!disposed) {
					retryTimer = window.setTimeout(connect, 1000);
				}
			};

			socket.onerror = () => {
				if (wsRef.current === socket) socket.close();
			};

			socket.onmessage = (event) => {
				if (wsRef.current !== socket) return;

				let message: ServerMessage;
				try {
					message = JSON.parse(String(event.data)) as ServerMessage;
				} catch {
					return;
				}

				if (message.type === "chat.started") {
					const id = nextId();
					assistantIdRef.current = id;
					setMessages((prev) => [...prev, { id, role: "assistant", text: "" }]);
					return;
				}

				if (message.type === "chat.delta") {
					const id = assistantIdRef.current;
					if (!id) return;
					setMessages((prev) =>
						prev.map((item) => (item.id === id ? { ...item, text: item.text + message.text } : item)),
					);
					return;
				}

				if (message.type === "tool.start") {
					const argsText =
						typeof message.args === "string" ? message.args : JSON.stringify(message.args, null, 2);
					setMessages((prev) => [
						...prev,
						{
							id: nextId(),
							role: "tool",
							text: `▶ ${message.toolName}\n${argsText}`,
						},
					]);
					return;
				}

				if (message.type === "tool.end") {
					setMessages((prev) => [
						...prev,
						{
							id: nextId(),
							role: "tool",
							text: `${message.isError ? "✗" : "✓"} ${message.toolName}\n${message.summary}`,
						},
					]);
					return;
				}

				if (message.type === "chat.done") {
					setBusy(false);
					assistantIdRef.current = null;
					return;
				}

				if (message.type === "chat.error") {
					setBusy(false);
					assistantIdRef.current = null;
					setMessages((prev) => [...prev, { id: nextId(), role: "error", text: message.message }]);
				}
			};
		};

		connect();

		return () => {
			disposed = true;
			window.clearTimeout(retryTimer);
			const socket = active;
			active = undefined;
			if (socket) {
				socket.onclose = null;
				socket.onerror = null;
				socket.onmessage = null;
				socket.onopen = null;
				if (wsRef.current === socket) {
					wsRef.current = null;
					setConnected(false);
				}
				socket.close();
			}
		};
	}, []);

	const sendChat = () => {
		const text = input.trim();
		if (!text || busy) return;

		const ws = wsRef.current;
		if (!ws || ws.readyState !== WebSocket.OPEN) {
			setConnected(false);
			setMessages((prev) => [
				...prev,
				{
					id: nextId(),
					role: "error",
					text: "未连接 runtime。请先在终端运行：pnpm dev:runtime",
				},
			]);
			return;
		}

		const id = nextId();
		const payload: ClientMessage = {
			type: "chat.send",
			id,
			text,
			config,
		};

		setMessages((prev) => [...prev, { id: nextId(), role: "user", text }]);
		setInput("");
		setBusy(true);
		ws.send(JSON.stringify(payload));
	};

	return (
		<div className="app">
			<header className="brand">
				<div>
					<h1>Pine</h1>
					<p>聊天 + 工具（read / write / edit / bash）</p>
				</div>
				<p className={`status ${connected ? "ok" : "bad"}`}>{statusLabel}</p>
			</header>

			<section className="config">
				<label>
					模型 ID
					<input
						value={config.modelId}
						onChange={(event) => setConfig((prev) => ({ ...prev, modelId: event.target.value }))}
						placeholder="deepseek-chat / gpt-4o-mini"
					/>
				</label>
				<label>
					Base URL
					<input
						value={config.baseUrl}
						onChange={(event) => setConfig((prev) => ({ ...prev, baseUrl: event.target.value }))}
						placeholder="https://api.deepseek.com/v1"
					/>
				</label>
				<label>
					API Key（Ollama 可留空）
					<input
						type="password"
						value={config.apiKey}
						onChange={(event) => setConfig((prev) => ({ ...prev, apiKey: event.target.value }))}
						placeholder="sk-... 或留空"
					/>
				</label>
				<label className="cwd">
					工作目录（工具作用范围）
					<input
						value={config.cwd ?? ""}
						onChange={(event) => setConfig((prev) => ({ ...prev, cwd: event.target.value }))}
						placeholder="E:\agents\pine"
					/>
				</label>
			</section>

			<section className="messages">
				{messages.length === 0 ? (
					<div className="empty">
						试着说：列出当前目录的文件，或读取 README.md
						<br />
						工具：read / write / edit / bash
					</div>
				) : (
					messages.map((message) => (
						<div key={message.id} className={`bubble ${message.role}`}>
							{message.text || (message.role === "assistant" ? "..." : "")}
						</div>
					))
				)}
				<div ref={bottomRef} />
			</section>

			<section className="composer">
				<textarea
					value={input}
					onChange={(event) => setInput(event.target.value)}
					placeholder="例如：读取 README.md 并总结"
					onKeyDown={(event) => {
						if (event.key === "Enter" && !event.shiftKey) {
							event.preventDefault();
							sendChat();
						}
					}}
				/>
				<button type="button" disabled={busy || !input.trim()} onClick={sendChat}>
					发送
				</button>
			</section>
		</div>
	);
}
