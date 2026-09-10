import { expect, test } from "@playwright/test";
import { connectToChat, initMockPi, openWorkspace, refreshFile } from "./helpers";

const seededEntries = [
  { name: "src", path: "/workspace/demo/src", type: "dir" },
  { name: "index.ts", path: "/workspace/demo/index.ts", type: "file" },
];

test.describe("workspace files", () => {
  test.beforeEach(async ({ page }) => {
    await initMockPi(page, { dirEntries: seededEntries, fileContent: "const x = 1;" });
    await connectToChat(page);
  });

  test("opens a folder and lists its files", async ({ page }) => {
    await openWorkspace(page);
    await expect(page.getByText("demo")).toBeVisible();

    await page.getByText("demo").click();
    await expect(page.getByText("src")).toBeVisible();
    await expect(page.getByText("index.ts")).toBeVisible();
  });

  test("opens a file and shows its content in the editor", async ({ page }) => {
    await openWorkspace(page);
    await page.getByText("demo").click();
    await page.getByText("index.ts").click();

    await expect(page.getByRole("textbox")).toHaveValue("const x = 1;");
  });

  test("edits and saves a file", async ({ page }) => {
    await openWorkspace(page);
    await page.getByText("demo").click();
    await page.getByText("index.ts").click();

    const editor = page.getByRole("textbox");
    await editor.fill("const x = 2;");
    await expect(page.getByText("Unsaved", { exact: true })).toBeVisible();

    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });

  test("creates a file from the context menu", async ({ page }) => {
    await openWorkspace(page);
    await page.getByText("demo").click({ button: "right" });
    await page.getByRole("button", { name: "New File" }).click();
    await page.getByPlaceholder("File name").fill("new.ts");
    await page.getByRole("button", { name: "OK" }).click();

    await page.getByText("demo").click();
    await expect(page.getByText("new.ts")).toBeVisible();
  });

  test("renames a file from the context menu", async ({ page }) => {
    await openWorkspace(page);
    await page.getByText("demo").click();
    await page.getByText("index.ts").click({ button: "right" });
    await page.getByRole("button", { name: "Rename" }).click();
    await page.getByPlaceholder("New name").fill("renamed.ts");
    await page.getByRole("button", { name: "OK" }).click();

    await expect(page.getByText("renamed.ts")).toBeVisible();
    await expect(page.getByText("index.ts")).toHaveCount(0);
  });

  test("deletes a file after confirmation", async ({ page }) => {
    await openWorkspace(page);
    await page.getByText("demo").click();
    await page.getByText("index.ts").click({ button: "right" });
    await page.getByRole("button", { name: "Delete" }).click();
    await page.getByRole("button", { name: "Delete", exact: true }).click();

    await expect(page.getByText("index.ts")).toHaveCount(0);
    await expect(page.getByText("src")).toBeVisible();
  });

  test("shows an external edit as a reviewable diff and reverts it", async ({ page }) => {
    await openWorkspace(page);
    await page.getByText("demo").click();
    await page.getByText("index.ts").click();
    await expect(page.getByRole("textbox")).toHaveValue("const x = 1;");

    await refreshFile(page, "const x = 2;");

    // The external change must surface as a reviewable diff, not as the user's
    // own unsaved typing.
    await expect(page.getByRole("textbox")).toHaveValue("const x = 2;");
    await expect(page.getByText("External change", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Diff" })).toBeVisible();

    await page.getByRole("button", { name: "Revert" }).click();
    await expect(page.getByRole("textbox")).toHaveValue("const x = 1;");
    await expect(page.getByText("Saved", { exact: true })).toBeVisible();
  });
});
