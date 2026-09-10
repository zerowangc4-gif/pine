import { expect, test } from "@playwright/test";
import {
  connectToChat,
  emitChatEvent,
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

  test("shows an executed command and an edit diff in the chat", async ({ page }) => {
    await initMockPi(page, { nextReply: "Done" });
    await connectToChat(page);
    await openWorkspace(page);

    await page.getByPlaceholder("Type a message…").fill("Make the change");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Done")).toBeVisible();

    await emitChatEvent(page, {
      type: "tool_start",
      toolId: "tool-1",
      toolName: "bash",
      summary: "ls -la src",
    });
    await emitChatEvent(page, { type: "tool_end", toolId: "tool-1", toolName: "bash", isError: false });

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

    await expect(page.getByText("ls -la src")).toBeVisible();
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
});
