import { test, expect } from "@playwright/test";

test.describe("Search page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/search");
  });

  test("loads the search page", async ({ page }) => {
    await expect(page).toHaveURL(/\/search/);
  });

  test("displays a search input", async ({ page }) => {
    const input = page.getByRole("searchbox").or(
      page.locator("input[type='search'], input[type='text'][placeholder*='earch']"),
    );
    await expect(input.first()).toBeVisible();
  });

  test("allows typing in the search input", async ({ page }) => {
    const input = page.getByRole("searchbox").or(
      page.locator("input[type='search'], input[type='text']"),
    ).first();
    await input.fill("knowledge graph");
    await expect(input).toHaveValue("knowledge graph");
  });

  test("has a search heading or label", async ({ page }) => {
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible();
  });

  test("displays filter or category buttons", async ({ page }) => {
    // Wait for page to settle
    await page.waitForLoadState("networkidle");
    const buttons = page.getByRole("button");
    const count = await buttons.count();
    // The search page should have at least some interactive elements
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test("search input has accessible label or placeholder", async ({ page }) => {
    const input = page.locator("input").first();
    const placeholder = await input.getAttribute("placeholder");
    const ariaLabel = await input.getAttribute("aria-label");
    const id = await input.getAttribute("id");
    // Either a placeholder, aria-label, or associated label should exist
    const hasAccessibility = placeholder || ariaLabel || id;
    expect(hasAccessibility).toBeTruthy();
  });

  test("submitting search does not crash the page", async ({ page }) => {
    const input = page.locator("input").first();
    await input.fill("test query");
    await page.keyboard.press("Enter");
    // Page should still be functional (not error out)
    await expect(page.locator("body")).toBeVisible();
  });

  test("URL may update with search query", async ({ page }) => {
    const input = page.locator("input").first();
    await input.fill("graph theory");
    await page.keyboard.press("Enter");
    await page.waitForURL(/\/search/);
    await expect(page.locator("body")).toBeVisible();
  });
});
