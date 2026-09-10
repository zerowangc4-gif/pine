import { expect, test } from "@playwright/test";
import { connectToChat, emitChatEvent, initMockPi, openWorkspace } from "./helpers";

// 1x1 transparent PNG, just enough for the renderer's data-URL reader.
const PNG_BYTES = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

test.describe("app chrome", () => {
  test.beforeEach(async ({ page }) => {
    await initMockPi(page);
    await connectToChat(page);
  });

  test("switches between dark and light theme", async ({ page }) => {
    await page.getByTitle("Switch to light theme").click();
    await expect(page.getByTitle("Switch to dark theme")).toBeVisible();
  });

  test("switches between English and Chinese", async ({ page }) => {
    await page.getByRole("button", { name: "中文" }).click();
    await expect(page.getByText("开始对话")).toBeVisible();
  });

  test("collapses and restores the sidebar", async ({ page }) => {
    await expect(page.getByText("Sessions", { exact: true })).toBeVisible();

    await page.getByTitle("Fullscreen (hide sidebar)").click();
    await expect(page.getByText("Sessions", { exact: true })).toHaveCount(0);

    await page.getByTitle("Show sidebar").click();
    await expect(page.getByText("Sessions", { exact: true })).toBeVisible();
  });
});

test.describe("chat presentation", () => {
  test("renders markdown in the assistant reply", async ({ page }) => {
    await initMockPi(page, { nextReply: "# Heading\n\n**bold** and `code`" });
    await connectToChat(page);
    await openWorkspace(page);

    await page.getByPlaceholder("Type a message…").fill("Hello");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("heading", { name: "Heading" })).toBeVisible();
    await expect(page.getByText("bold")).toBeVisible();
    await expect(page.getByText("code")).toBeVisible();
  });

  test("shows and expands the thinking block", async ({ page }) => {
    await initMockPi(page, { nextReply: "Done", holdStreaming: true });
    await connectToChat(page);
    await openWorkspace(page);

    await page.getByPlaceholder("Type a message…").fill("Hello");
    await page.getByRole("button", { name: "Send" }).click();
    await expect(page.getByText("Done")).toBeVisible();

    await emitChatEvent(page, { type: "thinking_delta", delta: "Let me think about this." });
    await expect(page.getByText("Thinking")).toBeVisible();

    await page.getByText("Thinking").click();
    await expect(page.getByText("Let me think about this.")).toBeVisible();
  });

  test("attaches an image to a message", async ({ page }) => {
    await initMockPi(page, { nextReply: "Got it" });
    await connectToChat(page);
    await openWorkspace(page);

    await page.setInputFiles('input[type="file"]', {
      name: "pic.png",
      mimeType: "image/png",
      buffer: PNG_BYTES,
    });

    await expect(page.getByTitle("Remove image")).toBeVisible();
    await page.getByPlaceholder("Type a message…").fill("What is this?");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByText("Got it")).toBeVisible();
  });

  test("offers follow-up and steer while streaming", async ({ page }) => {
    await initMockPi(page, { nextReply: "Partial", holdStreaming: true });
    await connectToChat(page);
    await openWorkspace(page);

    await page.getByPlaceholder("Type a message…").fill("Start");
    await page.getByRole("button", { name: "Send" }).click();

    await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Follow up" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Interrupt" })).toBeVisible();

    await page.getByPlaceholder("Type a message…").fill("Continue");
    await page.getByRole("button", { name: "Follow up" }).click();
    await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  });
});
