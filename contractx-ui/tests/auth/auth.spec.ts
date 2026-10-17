import { test, expect } from "@playwright/test";

const TEST_EMAIL = process.env.CONTRACTX_TEST_EMAIL;
const TEST_PASSWORD = process.env.CONTRACTX_TEST_PASSWORD;
const TEST_PROJECT_ID = process.env.CONTRACTX_TEST_PROJECT_ID;

test.describe("ContractX authentication regression", () => {
  test.beforeEach(async ({ page }) => {
    const consoleErrors: string[] = [];
    const pageErrors: string[] = [];

    page.on("console", (message) => {
      if (message.type() === "error") {
        consoleErrors.push(message.text());
      }
    });

    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });

    const response = await page.goto("/login", {
      waitUntil: "domcontentloaded",
    });

    expect(response).not.toBeNull();
    expect(response?.ok()).toBeTruthy();

    await expect(page).toHaveURL(/\/login/);

    try {
      await expect(page.locator("#email")).toBeVisible({
        timeout: 30000,
      });

      await expect(page.locator("#password")).toBeVisible({
        timeout: 30000,
      });
    } catch (error) {
      console.log("LOGIN FINAL URL:", page.url());

      console.log(
        "LOGIN BODY:",
        await page.locator("body").innerText().catch(() => "")
      );

      console.log("LOGIN CONSOLE ERRORS:", consoleErrors);
      console.log("LOGIN PAGE ERRORS:", pageErrors);

      throw error;
    }
  });

  test("login page renders required authentication controls", async ({ page }) => {
    await expect(page.locator("#email")).toBeVisible();
    await expect(page.locator("#password")).toBeVisible();
    await expect(page.getByRole("checkbox")).toBeVisible();

    await expect(
      page.getByRole("button", { name: "Secure Login" })
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Forgot password?" })
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Terms of Service" })
    ).toBeVisible();

    await expect(
      page.getByRole("link", { name: "Privacy Policy" })
    ).toBeVisible();
  });

  test("login button remains disabled until required fields and terms are completed", async ({ page }) => {
    const loginButton = page.getByRole("button", {
      name: "Secure Login",
    });

    await expect(loginButton).toBeDisabled();

    await page.locator("#email").fill("regression-form-check@contractx.co");
    await page.locator("#password").fill("RegressionPassword123!");

    await expect(loginButton).toBeDisabled();

    await page.getByRole("checkbox").check();

    await expect(loginButton).toBeEnabled();
  });

  test("invalid credentials are rejected", async ({ page }) => {
    await page.locator("#email").fill("invalid-regression@contractx.co");
    await page.locator("#password").fill("DefinitelyInvalidPassword123!");

    await page.getByRole("checkbox").check();

    await page
      .getByRole("button", { name: "Secure Login" })
      .click();

    await expect(
      page.getByText(
        "Unable to sign in. Check your email and password."
      )
    ).toBeVisible({
      timeout: 20000,
    });

    await expect(page).toHaveURL(/\/login/);
  });

  test("password visibility control works", async ({ page }) => {
    const password = page.locator("#password");

    await password.fill("ExamplePassword123!");

    await expect(password).toHaveAttribute("type", "password");

    await page
      .getByRole("button", { name: "Show password" })
      .click();

    await expect(password).toHaveAttribute("type", "text");

    await page
      .getByRole("button", { name: "Hide password" })
      .click();

    await expect(password).toHaveAttribute("type", "password");
  });

  test("valid test user can authenticate", async ({ page }) => {
    if (!TEST_EMAIL || !TEST_PASSWORD) {
      throw new Error(
        "CONTRACTX_TEST_EMAIL and CONTRACTX_TEST_PASSWORD must be defined before running authenticated regression tests."
      );
    }

    await page.locator("#email").fill(TEST_EMAIL);
    await page.locator("#password").fill(TEST_PASSWORD);

    await page.getByRole("checkbox").check();

    const loginButton = page.getByRole("button", {
      name: "Secure Login",
    });

    await expect(loginButton).toBeEnabled();

    await loginButton.click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/portfolio" ||
        url.pathname === "/onboarding/Project" ||
        url.pathname === "/onboarding/project" ||
        url.pathname === "/dashboard",
      {
        timeout: 30000,
      }
    );

    const finalUrl = new URL(page.url());

    console.log("AUTHENTICATED ROUTE:", finalUrl.toString());

    expect(
      [
        "/portfolio",
        "/onboarding/Project",
        "/onboarding/project",
        "/dashboard",
      ]
    ).toContain(finalUrl.pathname);

    if (TEST_PROJECT_ID) {
      expect(finalUrl.pathname).toBe("/dashboard");

      expect(
        finalUrl.searchParams.get("project")
      ).toBe(TEST_PROJECT_ID);
    } else if (finalUrl.pathname === "/dashboard") {
      expect(
        finalUrl.searchParams.get("project")
      ).toBeTruthy();
    }
  });
});
