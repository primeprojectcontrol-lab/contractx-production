import { test, expect } from "@playwright/test";

test.describe("ContractX public smoke regression", () => {
  test("login page loads successfully", async ({ page }) => {
    const response = await page.goto("/login");

    expect(response).not.toBeNull();
    expect(response?.ok()).toBeTruthy();

    await expect(page).toHaveURL(/\/login/);
    await expect(page.locator("html")).toBeAttached();
  });

  test("landing page loads successfully", async ({ page }) => {
    const response = await page.goto("/landing");

    expect(response).not.toBeNull();
    expect(response?.ok()).toBeTruthy();

    await expect(page).toHaveURL(/\/landing/);

    await expect(page.locator("main").first()).toBeAttached();
  });
});