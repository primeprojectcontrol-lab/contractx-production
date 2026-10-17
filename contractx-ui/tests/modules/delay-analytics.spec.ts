import { test, expect } from "@playwright/test";

import {
  assertNoFatalPageErrors,
  assertProjectRoute,
  assertRegressionProjectVisible,
  projectUrl,
  requireRegressionEnvironment,
  watchPageErrors,
} from "./helpers";

test.describe("Stage 3 - Delay Analytics", () => {
  test.beforeEach(() => {
    requireRegressionEnvironment();
  });

  test("opens with authenticated project context", async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);

    await page.goto(projectUrl("/delay-analytics"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Delay Analysis",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByText("Current Analysis Context", {
        exact: true,
      })
    ).toBeVisible();

    await expect(
      page.getByText("Recent Delay Analysis", {
        exact: true,
      })
    ).toBeVisible();

    await assertRegressionProjectVisible(page);

    await assertProjectRoute(
      page,
      "/delay-analytics"
    );

    await assertNoFatalPageErrors(pageErrors);
  });

  test("retains project context after reload", async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);

    await page.goto(projectUrl("/delay-analytics"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Delay Analysis",
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
        name: "Delay Analysis",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await assertProjectRoute(
      page,
      "/delay-analytics"
    );

    await assertRegressionProjectVisible(page);

    await assertNoFatalPageErrors(pageErrors);
  });
});