import { test, expect } from "@playwright/test";

import {
  assertNoFatalPageErrors,
  assertProjectRoute,
  assertRegressionProjectVisible,
  projectUrl,
  requireRegressionEnvironment,
  watchPageErrors,
} from "./helpers";

test.describe("Stage 3 - Claims & Resolution", () => {
  test.beforeEach(() => {
    requireRegressionEnvironment();
  });

  test("opens with authenticated project context", async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);

    await page.goto(projectUrl("/claims"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Claims & Resolution",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page
        .getByRole("main")
        .getByText("Current Project", {
          exact: true,
        })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByRole("heading", {
        name: "Define the issue",
        exact: true,
      })
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Select project records",
        exact: true,
      })
    ).toBeVisible();

    await assertRegressionProjectVisible(page);

    await assertProjectRoute(
      page,
      "/claims"
    );

    await assertNoFatalPageErrors(pageErrors);
  });

  test("retains project context after reload", async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);

    await page.goto(projectUrl("/claims"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Claims & Resolution",
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
        name: "Claims & Resolution",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page
        .getByRole("main")
        .getByText("Current Project", {
          exact: true,
        })
    ).toBeVisible({
      timeout: 30000,
    });

    await assertProjectRoute(
      page,
      "/claims"
    );

    await assertRegressionProjectVisible(page);

    await assertNoFatalPageErrors(pageErrors);
  });
});