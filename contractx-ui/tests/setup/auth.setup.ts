import fs from "fs";
import path from "path";
import { test as setup, expect } from "@playwright/test";

const TEST_EMAIL = process.env.CONTRACTX_TEST_EMAIL;
const TEST_PASSWORD = process.env.CONTRACTX_TEST_PASSWORD;
const TEST_PROJECT_ID = process.env.CONTRACTX_TEST_PROJECT_ID;

const authFile = path.resolve(
  process.cwd(),
  "playwright",
  ".auth",
  "regression-user.json"
);

setup("authenticate regression user", async ({ page }) => {
  if (!TEST_EMAIL || !TEST_PASSWORD || !TEST_PROJECT_ID) {
    throw new Error(
      "CONTRACTX_TEST_EMAIL, CONTRACTX_TEST_PASSWORD and CONTRACTX_TEST_PROJECT_ID are required."
    );
  }

  fs.mkdirSync(path.dirname(authFile), {
    recursive: true,
  });

  await page.goto("/login", {
    waitUntil: "domcontentloaded",
  });

  await expect(page.locator("#email")).toBeVisible({
    timeout: 15000,
  });

  await page.locator("#email").fill(TEST_EMAIL);
  await page.locator("#password").fill(TEST_PASSWORD);

  await page.getByRole("checkbox").check();

  await page
    .getByRole("button", { name: "Secure Login" })
    .click();

  await page.waitForURL(
    (url) =>
      url.pathname === "/dashboard" &&
      url.searchParams.get("project") === TEST_PROJECT_ID,
    {
      timeout: 30000,
    }
  );

  const finalUrl = new URL(page.url());

  expect(finalUrl.pathname).toBe("/dashboard");
  expect(finalUrl.searchParams.get("project")).toBe(
    TEST_PROJECT_ID
  );

  console.log("AUTHENTICATED ROUTE:", finalUrl.toString());
  console.log("AUTH STORAGE TARGET:", authFile);

  await page.context().storageState({
    path: authFile,
  });

  console.log("AUTH STORAGE CREATED:", authFile);
});
