import { expect, test } from "@playwright/test";
import {
  connectToChat,
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

  test("shows a permission prompt for a disabled tool and honors the decision", async ({ page }) => {
    await initMockPi(page);
    await connectToChat(page);

    await requestToolPermission(page, { requestId: "req-1", toolName: "bash", summary: "rm -rf build" });

    await expect(page.getByText("Tool permission required")).toBeVisible();
    await expect(page.getByText("The assistant wants to use bash: rm -rf build")).toBeVisible();

    await page.getByRole("button", { name: "Allow" }).click();

    await expect.poll(() => getLastPermissionResponse(page)).toEqual({
      requestId: "req-1",
      allowed: true,
    });
    await expect(page.getByText("Tool permission required")).toHaveCount(0);
  });
});
