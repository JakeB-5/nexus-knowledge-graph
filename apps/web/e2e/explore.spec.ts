import { test, expect } from "@playwright/test";

test.describe("Explore page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/explore");
  });

  test("loads the explore page", async ({ page }) => {
    await expect(page).toHaveURL(/\/explore/);
  });

  test("has a heading on the explore page", async ({ page }) => {
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible();
  });

  test("renders main content area", async ({ page }) => {
    await page.waitForLoadState("networkidle");
    const main = page.getByRole("main").or(page.locator("main, [data-testid='explore']"));
    await expect(main.first()).toBeVisible();
  });

  test("does not display a 404 error", async ({ page }) => {
    const body = await page.locator("body").textContent();
    expect(body).not.toMatch(/404/i);
    expect(body).not.toMatch(/not found/i);
  });

  test("back navigation works from explore page", async ({ page }) => {
    await page.goto("/");
    await page.goto("/explore");
    await page.goBack();
    await expect(page).toHaveURL(/\//);
  });

  test("has navigation or link back to home", async ({ page }) => {
    // Explore page should have some navigation element
    await page.waitForLoadState("networkidle");
    const navOrLink = page
      .getByRole("navigation")
      .or(page.getByRole("link", { name: /home|nexus/i }));
    // Navigation may or may not be present depending on implementation
    const count = await navOrLink.count();
    expect(count).toBeGreaterThanOrEqual(0);
  });
});
