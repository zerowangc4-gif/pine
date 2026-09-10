import { expect, test } from "@playwright/test";
import { connectToChat, initMockPi, sessionFixture, wasExported } from "./helpers";

const seededSessions = [sessionFixture(1), sessionFixture(2)];
const seededMessages = {
  "/sessions/session-1.jsonl": [
    { id: "m1", role: "user", text: "Hello from session 1" },
    {
      id: "m2",
      role: "assistant",
      text: "Reply from session 1",
      tools: [{ id: "tool-1", name: "bash", status: "done", summary: "rm -rf build" }],
    },
  ],
  "/sessions/session-2.jsonl": [
    { id: "m3", role: "user", text: "Hello from session 2" },
    { id: "m4", role: "assistant", text: "Reply from session 2" },
  ],
};

test.describe("chat session management", () => {
  test.beforeEach(async ({ page }) => {
    await initMockPi(page, { sessions: seededSessions, messagesByPath: seededMessages });
    await connectToChat(page);
  });

  test("lists saved sessions in the sidebar", async ({ page }) => {
    await expect(page.getByText("Session 1")).toBeVisible();
    await expect(page.getByText("Session 2")).toBeVisible();
  });

  test("loads a session and restores its messages", async ({ page }) => {
    await page.getByText("Session 1").click();

    await expect(page.getByText("Hello from session 1")).toBeVisible();
    await expect(page.getByText("Reply from session 1")).toBeVisible();
  });

  test("shows a persisted shell command when reloading a session", async ({ page }) => {
    await page.getByText("Session 1").click();

    await expect(page.getByText("rm -rf build")).toBeVisible();
  });

  test("deletes a session after confirmation", async ({ page }) => {
    await page.getByTitle("Delete Session").first().click();

    const confirmDelete = page.getByRole("button", { name: "Delete", exact: true });
    await expect(confirmDelete).toBeVisible();
    await confirmDelete.click();

    await expect(page.getByText("Session 1")).toHaveCount(0);
    await expect(page.getByText("Session 2")).toBeVisible();
  });

  test("starts a new session and clears the active conversation", async ({ page }) => {
    await page.getByText("Session 1").click();
    await expect(page.getByText("Hello from session 1")).toBeVisible();

    await page.getByRole("button", { name: "New Session" }).click();

    await expect(page.getByText("Start a conversation")).toBeVisible();
  });

  test("renames the active session from the settings modal", async ({ page }) => {
    await page.getByText("Session 1").click();
    await page.getByTitle("Session Settings").click();

    const nameInput = page.getByPlaceholder("Name this session");
    await nameInput.fill("Renamed Session");
    await page.getByRole("button", { name: "Save" }).click();

    await expect(page.getByText("Renamed Session")).toBeVisible();
  });

  test("persists the auto-compaction toggle across a session reload", async ({ page }) => {
    await page.getByText("Session 1").click();
    await page.getByTitle("Session Settings").click();

    const toggle = page.getByRole("switch", { name: "Auto-compact context" });
    await expect(toggle).toHaveAttribute("aria-checked", "false");
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-checked", "true");
    await page.getByRole("button", { name: "Cancel" }).click();

    // Switch away and back to force a full reload from the main process; the
    // setting must come back on rather than resetting to the default.
    await page.getByText("Session 2").click();
    await page.getByText("Session 1").click();
    await page.getByTitle("Session Settings").click();

    await expect(page.getByRole("switch", { name: "Auto-compact context" })).toHaveAttribute("aria-checked", "true");
  });

  test("exports the active session", async ({ page }) => {
    await page.getByText("Session 1").click();
    await page.getByTitle("Export session").click();

    await expect.poll(() => wasExported(page)).toBe(true);
  });
});
