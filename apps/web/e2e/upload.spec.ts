import { test, expect } from "@playwright/test";

test.describe("Core navigation", () => {
  test("should display the ingest page", async ({ page }) => {
    await page.goto("/upload");
    await expect(page).toHaveURL(/upload/);
  });

  test("should display the studio page", async ({ page }) => {
    await page.goto("/studio");
    await expect(page).toHaveURL(/studio/);
  });

  test("should display the dataset explorer", async ({ page }) => {
    await page.goto("/dataset");
    await expect(page).toHaveURL(/dataset/);
  });

  test("should navigate to files page", async ({ page }) => {
    await page.goto("/files");
    await expect(page).toHaveURL(/files/);
  });

  test("should display the dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator("body")).toBeVisible();
  });
});
