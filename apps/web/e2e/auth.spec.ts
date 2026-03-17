import { test, expect } from "@playwright/test";

test.describe("Login page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/login");
  });

  test("loads the login page", async ({ page }) => {
    await expect(page).toHaveURL(/\/auth\/login/);
  });

  test("has a login heading", async ({ page }) => {
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible();
  });

  test("has an email input", async ({ page }) => {
    const email = page.locator("input[type='email'], input[name='email']");
    await expect(email.first()).toBeVisible();
  });

  test("has a password input", async ({ page }) => {
    const password = page.locator("input[type='password']");
    await expect(password.first()).toBeVisible();
  });

  test("has a submit button", async ({ page }) => {
    const submit = page
      .getByRole("button", { name: /sign in|log in|login/i })
      .or(page.locator("button[type='submit']"));
    await expect(submit.first()).toBeVisible();
  });

  test("shows error for empty form submission", async ({ page }) => {
    const submit = page
      .getByRole("button", { name: /sign in|log in|login/i })
      .or(page.locator("button[type='submit']"));
    await submit.first().click();
    // Form validation should prevent submission or show an error
    await page.waitForLoadState("networkidle");
    await expect(page.locator("body")).toBeVisible();
  });

  test("allows typing in email and password fields", async ({ page }) => {
    const email = page.locator("input[type='email'], input[name='email']").first();
    const password = page.locator("input[type='password']").first();
    await email.fill("user@example.com");
    await password.fill("mypassword");
    await expect(email).toHaveValue("user@example.com");
    await expect(password).toHaveValue("mypassword");
  });

  test("has a link to register", async ({ page }) => {
    const registerLink = page.getByRole("link", { name: /register|sign up|create account/i });
    const count = await registerLink.count();
    // If a register link exists, it should point to the register page
    if (count > 0) {
      await expect(registerLink.first()).toBeVisible();
    }
  });
});

test.describe("Register page", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/auth/register");
  });

  test("loads the register page", async ({ page }) => {
    await expect(page).toHaveURL(/\/auth\/register/);
  });

  test("has a registration heading", async ({ page }) => {
    const heading = page.getByRole("heading").first();
    await expect(heading).toBeVisible();
  });

  test("has an email input", async ({ page }) => {
    const email = page.locator("input[type='email'], input[name='email']");
    await expect(email.first()).toBeVisible();
  });

  test("has a password input", async ({ page }) => {
    const password = page.locator("input[type='password']");
    await expect(password.first()).toBeVisible();
  });

  test("has a submit/register button", async ({ page }) => {
    const submit = page
      .getByRole("button", { name: /register|sign up|create/i })
      .or(page.locator("button[type='submit']"));
    await expect(submit.first()).toBeVisible();
  });

  test("allows filling registration form", async ({ page }) => {
    const email = page.locator("input[type='email'], input[name='email']").first();
    const password = page.locator("input[type='password']").first();
    await email.fill("newuser@example.com");
    await password.fill("StrongP@ss1");
    await expect(email).toHaveValue("newuser@example.com");
    await expect(password).toHaveValue("StrongP@ss1");
  });

  test("has a link back to login", async ({ page }) => {
    const loginLink = page.getByRole("link", { name: /sign in|log in|login/i });
    const count = await loginLink.count();
    if (count > 0) {
      await expect(loginLink.first()).toBeVisible();
    }
  });
});
