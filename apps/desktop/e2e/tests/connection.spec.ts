import { expect, test } from "@playwright/test";
import { connectToChat, getActiveModel, initMockPi } from "./helpers";

test.describe("connection", () => {
  test.beforeEach(async ({ page }) => {
    await initMockPi(page);
    await connectToChat(page);
  });

  test("switches the active model from the composer", async ({ page }) => {
    await expect.poll(() => getActiveModel(page)).toMatchObject({ model: "claude-sonnet-4-5" });

    await page.getByRole("button", { name: "Claude Sonnet 4.5" }).click();
    await page.getByRole("button", { name: "Claude Opus 4.5" }).click();

    await expect.poll(() => getActiveModel(page)).toEqual({
      provider: "anthropic",
      model: "claude-opus-4-5",
      thinkingLevel: "high",
    });
  });

  test("switches thinking level between fast and deep", async ({ page }) => {
    await page.getByRole("button", { name: "Fast" }).click();
    await expect.poll(() => getActiveModel(page)).toMatchObject({ thinkingLevel: "low" });

    await page.getByRole("button", { name: "Deep" }).click();
    await expect.poll(() => getActiveModel(page)).toMatchObject({ thinkingLevel: "high" });
  });

  test("adds a provider key without leaving the chat", async ({ page }) => {
    await page.getByTitle("Add a provider key").click();

    await expect(page.getByText("Connect Provider")).toBeVisible();
    // The first non-configured provider (OpenAI) and its first model are
    // pre-selected, so only the key is required.
    await page.getByPlaceholder("OpenAI API Key").fill("sk-test");
    await page.getByRole("button", { name: "Connect", exact: true }).click();

    await expect(page.getByText("Connect Provider")).toHaveCount(0);
    await expect.poll(() => getActiveModel(page)).toEqual({
      provider: "openai",
      model: "gpt-5-mini",
      thinkingLevel: "high",
    });
  });
});
