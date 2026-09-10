import { fileURLToPath } from "node:url";
import type { Page } from "@playwright/test";

const mockPath = fileURLToPath(new URL("../mocks/pi.js", import.meta.url));

/**
 * Inject the mock `window.pi` bridge before the app boots. `init` is optional
 * fixture data consumed by `mocks/pi.js` (sessions, messages, nextReply, …).
 */
export async function initMockPi(page: Page, init: Record<string, unknown> = {}): Promise<void> {
  await page.addInitScript(`window.__PINE_E2E_INIT = ${JSON.stringify(init)};`);
  await page.addInitScript({ path: mockPath });
}

/** Navigate to the renderer app (the HashRouter lands on the login gate). */
export async function gotoApp(page: Page): Promise<void> {
  await page.goto("/");
}

/**
 * Walk through the login gate into the chat page. The mock provider is already
 * "configured", so no API key is required and the Connect button is enabled.
 */
export async function connectToChat(page: Page): Promise<void> {
  await gotoApp(page);
  await page.getByRole("button", { name: "Connect" }).click();
  await page.getByText("Start a conversation").waitFor();
}

interface PiMockControls {
  setNextReply(text: string): void;
  setHoldStreaming(value: boolean): void;
  getLastCopied(): string;
  wasExported(): boolean;
  getSessions(): Record<string, unknown>[];
  getActivePath(): string | undefined;
  requestPermission(request: { requestId: string; toolName: string; summary: string }): void;
  emitChatEvent(event: Record<string, unknown>): void;
  getLastPermissionResponse(): { requestId: string; allowed: boolean } | null;
}

/** Read the mock's copy-text record after a copy action. */
export function getLastCopied(page: Page): Promise<string> {
  return page.evaluate(() => (window as unknown as { __pi: PiMockControls }).__pi.getLastCopied());
}

/** Whether the mock bridge handled an export request. */
export function wasExported(page: Page): Promise<boolean> {
  return page.evaluate(() => (window as unknown as { __pi: PiMockControls }).__pi.wasExported());
}

/** Simulate the main process asking for tool permission. */
export function requestToolPermission(
  page: Page,
  request: { requestId: string; toolName: string; summary: string },
): Promise<void> {
  return page.evaluate(
    (payload) => (window as unknown as { __pi: PiMockControls }).__pi.requestPermission(payload),
    request,
  );
}

/** Emit an arbitrary chat event, mirroring the main-process event stream. */
export function emitChatEvent(page: Page, event: Record<string, unknown>): Promise<void> {
  return page.evaluate(
    (payload) => (window as unknown as { __pi: PiMockControls }).__pi.emitChatEvent(payload),
    event,
  );
}

/** Read the last permission decision the mock received. */
export function getLastPermissionResponse(
  page: Page,
): Promise<{ requestId: string; allowed: boolean } | null> {
  return page.evaluate(() => (window as unknown as { __pi: PiMockControls }).__pi.getLastPermissionResponse());
}

/**
 * Open the mock workspace folder. The chat composer is disabled until a folder
 * is open, so the conversation tests call this before typing.
 */
export async function openWorkspace(page: Page): Promise<void> {
  await page.getByRole("button", { name: "Open Folder" }).first().click();
  await page.getByPlaceholder("Type a message…").waitFor();
}

/** A deterministic session fixture factory shared by the session tests. */
export function sessionFixture(index: number, overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: `session-${index}`,
    path: `/sessions/session-${index}.jsonl`,
    name: `Session ${index}`,
    cwd: "/workspace/demo",
    created: "2025-09-10T00:00:00.000Z",
    modified: "2025-09-10T00:00:00.000Z",
    messageCount: 2,
    firstMessage: `First message ${index}`,
    ...overrides,
  };
}
