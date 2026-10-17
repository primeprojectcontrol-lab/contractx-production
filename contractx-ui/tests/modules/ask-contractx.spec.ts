import { test, expect } from "@playwright/test";

import {
  assertNoFatalPageErrors,
  assertProjectRoute,
  assertRegressionProjectVisible,
  projectUrl,
  requireRegressionEnvironment,
  watchPageErrors,
} from "./helpers";

test.describe("Stage 3 - Ask ContractX", () => {
  test.beforeEach(() => {
    requireRegressionEnvironment();
  });

  test("opens with authenticated project context", async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);

    await page.goto(projectUrl("/ask-contractx"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Ask ContractX",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByText("Active Project Scope", {
        exact: true,
      })
    ).toBeVisible();

    await assertRegressionProjectVisible(page);

    await assertProjectRoute(
      page,
      "/ask-contractx"
    );

    await assertNoFatalPageErrors(pageErrors);
  });

  test("retains project context after reload", async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);

    await page.goto(projectUrl("/ask-contractx"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Ask ContractX",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await page.reload({
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Ask ContractX",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await assertProjectRoute(
      page,
      "/ask-contractx"
    );

    await assertRegressionProjectVisible(page);

    await assertNoFatalPageErrors(pageErrors);
  });
});