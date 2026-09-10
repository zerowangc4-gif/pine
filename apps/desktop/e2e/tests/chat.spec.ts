import { expect, test } from "@playwright/test";
import {
  connectToChat,
  emitChatEvent,
  getLastActiveTools,
  getLastCopied,
  getLastPermissionResponse,
  initMockPi,
  openWorkspace,
  requestToolPermission,
} from "./helpers";

test.describe("chat conversation", () => {
  test("sends a message, streams a reply, and copies the assistant text", async ({ page }) => {
    await initMockPi(page, { nextReply: "Mock reply text" });
    await connectToChat(page);
    await openWorkspace(page);

    await page.getByPlaceholder("Type a message…").fill("Hello there");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Hello there")).toBeVisible();
    await expect(page.getByText("Mock reply text")).toBeVisible();

    // The assistant row is the second copy button in document order.
    await page.getByRole("button", { name: "Copy message" }).nth(1).click();
    await expect.poll(() => getLastCopied(page)).toBe("Mock reply text");
  });

  test("stops a held stream and returns to the composer", async ({ page }) => {
    await initMockPi(page, { nextReply: "Partial reply", holdStreaming: true });
    await connectToChat(page);
    await openWorkspace(page);

    await page.getByPlaceholder("Type a message…").fill("Start the agent");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await page.getByRole("button", { name: "Stop" }).click();

    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });

  test("disconnects and returns to the login gate", async ({ page }) => {
    await initMockPi(page);
    await connectToChat(page);

    await page.getByTitle("Disconnect").click();

    await expect(page.getByRole("button", { name: "Connect" })).toBeVisible();
  });

  test("shows a tool summary and an edit diff in the chat", async ({ page }) => {
    await initMockPi(page, { nextReply: "Done" });
    await connectToChat(page);
    await openWorkspace(page);

    await page.getByPlaceholder("Type a message…").fill("Make the change");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Done")).toBeVisible();

    await emitChatEvent(page, {
      type: "tool_start",
      toolId: "tool-1",
      toolName: "grep",
      summary: "TODO",
    });
    await emitChatEvent(page, { type: "tool_end", toolId: "tool-1", toolName: "grep", isError: false });

    await emitChatEvent(page, {
      type: "tool_start",
      toolId: "tool-2",
      toolName: "edit",
      diff: {
        path: "src/index.ts",
        hunks: [{ oldText: "const a = 1;", newText: "const a = 2;" }],
      },
    });
    await emitChatEvent(page, { type: "tool_end", toolId: "tool-2", toolName: "edit", isError: false });

    await expect(page.getByText("TODO")).toBeVisible();
    await expect(page.getByText("src/index.ts")).toBeVisible();
    await expect(page.getByText("const a = 1;")).toBeVisible();
    await expect(page.getByText("const a = 2;")).toBeVisible();
  });

  test("shows a permission prompt for a disabled tool and honors the decision", async ({ page }) => {
    await initMockPi(page);
    await connectToChat(page);

    await requestToolPermission(page, { requestId: "req-1", toolName: "bash", summary: "rm -rf build" });

    await expect(page.getByText("Tool permission required")).toBeVisible();
    await expect(page.getByText("The assistant wants to use bash.")).toBeVisible();

    await page.getByRole("button", { name: "Allow" }).click();

    await expect.poll(() => getLastPermissionResponse(page)).toEqual({
      requestId: "req-1",
      allowed: true,
    });
    await expect(page.getByText("Tool permission required")).toHaveCount(0);
  });

  test("keeps the permission prompt visible while a file is open", async ({ page }) => {
    await initMockPi(page, {
      dirEntries: [{ name: "index.ts", path: "/workspace/demo/index.ts", type: "file" }],
    });
    await connectToChat(page);
    await openWorkspace(page);

    // Open the file to switch from the chat view to the editor view. The
    // permission modal lives at the page level now, so it must survive this.
    await page.getByText("demo").click();
    await page.getByText("index.ts").click();
    await expect(page.getByPlaceholder("Type a message…")).toHaveCount(0);

    await requestToolPermission(page, { requestId: "req-1", toolName: "bash", summary: "rm -rf build" });

    await expect(page.getByText("Tool permission required")).toBeVisible();
    await page.getByRole("button", { name: "Allow" }).click();
    await expect.poll(() => getLastPermissionResponse(page)).toEqual({
      requestId: "req-1",
      allowed: true,
    });
  });

  test("clears a pending permission prompt when the main process drops it", async ({ page }) => {
    await initMockPi(page);
    await connectToChat(page);

    await requestToolPermission(page, { requestId: "req-1", toolName: "bash", summary: "rm -rf build" });
    await expect(page.getByText("Tool permission required")).toBeVisible();

    await emitChatEvent(page, { type: "tool_permission_cleared" });

    await expect(page.getByText("Tool permission required")).toHaveCount(0);
  });

  test("disabling every modifying tool sends only read-only tools to the main process", async ({ page }) => {
    await initMockPi(page);
    await connectToChat(page);

    await page.getByTitle("Permissions").click();
    await expect(page.getByRole("switch", { name: "Run shell commands" })).toBeVisible();

    const modifyingTools = [
      "Run shell commands",
      "Run PowerShell commands",
      "Edit files",
      "Write files",
    ];
    for (const label of modifyingTools) {
      await page.getByRole("switch", { name: label }).click();
      // Wait for the store to settle before toggling the next tool, otherwise
      // the next filter would be computed from the stale tool list.
      await expect(page.getByRole("switch", { name: label })).toHaveAttribute("aria-checked", "false");
    }

    await expect.poll(() => getLastActiveTools(page)).toEqual(["read", "grep", "find", "ls"]);
  });
});
