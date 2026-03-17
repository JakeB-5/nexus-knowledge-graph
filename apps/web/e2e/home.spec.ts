import { test, expect } from "@playwright/test";

test.describe("Home page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("displays the Nexus heading", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Nexus" })).toBeVisible();
  });

  test("displays the tagline", async ({ page }) => {
    await expect(page.getByText("Knowledge Graph Platform")).toBeVisible();
  });

  test("has an Explore Graph link", async ({ page }) => {
    const link = page.getByRole("link", { name: "Explore Graph" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/explore");
  });

  test("has a Search Knowledge link", async ({ page }) => {
    const link = page.getByRole("link", { name: "Search Knowledge" });
    await expect(link).toBeVisible();
    await expect(link).toHaveAttribute("href", "/search");
  });

  test("navigates to explore page from Explore Graph link", async ({ page }) => {
    await page.getByRole("link", { name: "Explore Graph" }).click();
    await expect(page).toHaveURL(/\/explore/);
  });

  test("navigates to search page from Search Knowledge link", async ({ page }) => {
    await page.getByRole("link", { name: "Search Knowledge" }).click();
    await expect(page).toHaveURL(/\/search/);
  });

  test("page has correct title", async ({ page }) => {
    await expect(page).toHaveTitle(/Nexus/i);
  });

  test("page is responsive on mobile viewport", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await expect(page.getByRole("heading", { name: "Nexus" })).toBeVisible();
  });
});
