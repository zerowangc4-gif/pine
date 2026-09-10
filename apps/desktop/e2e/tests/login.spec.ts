import { expect, test } from "@playwright/test";
import { gotoApp, initMockPi } from "./helpers";

test.describe("login gate", () => {
  test.beforeEach(async ({ page }) => {
    await initMockPi(page);
  });

  test("renders the login screen and enables Connect once providers load", async ({ page }) => {
    await gotoApp(page);

    await expect(page.getByRole("heading", { name: "Pine" })).toBeVisible();
    await expect(page.getByText("Provider", { exact: true })).toBeVisible();
    await expect(page.getByText("Model", { exact: true })).toBeVisible();

    // The mock provider is pre-configured, so no API key is required.
    await expect(page.getByRole("button", { name: "Connect" })).toBeEnabled();
  });

  test("connects and lands on the chat page", async ({ page }) => {
    await gotoApp(page);

    await page.getByRole("button", { name: "Connect" }).click();

    await expect(page.getByText("Start a conversation")).toBeVisible();
    await expect(page.getByText("Sessions", { exact: true })).toBeVisible();
  });
});
