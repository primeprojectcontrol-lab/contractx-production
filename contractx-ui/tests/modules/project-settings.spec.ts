import { test, expect } from "@playwright/test";

import {
  assertNoFatalPageErrors,
  assertProjectRoute,
  assertRegressionProjectVisible,
  projectUrl,
  requireRegressionEnvironment,
  watchPageErrors,
} from "./helpers";

test.describe("Stage 3 - Project Settings", () => {
  test.beforeEach(() => {
    requireRegressionEnvironment();
  });

  test("opens with authenticated project context", async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);

    await page.goto(projectUrl("/project-settings"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Project Settings & Admin Controls",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByText("Project Administration", {
        exact: true,
      })
    ).toBeVisible();

    await expect(
      page.getByRole("heading", {
        name: "Project Details",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByRole("button", {
        name: /Users & Access/,
      })
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: /Roles & Permissions/,
      })
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: /Notifications/,
      })
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: /AI Processing & Privacy/,
      })
    ).toBeVisible();

    await expect(
      page.getByRole("button", {
        name: /Lifecycle/,
      })
    ).toBeVisible();

    await assertRegressionProjectVisible(page);

    await assertProjectRoute(
      page,
      "/project-settings"
    );

    await assertNoFatalPageErrors(pageErrors);
  });

  test("retains project context after reload", async ({
    page,
  }) => {
    const pageErrors = watchPageErrors(page);

    await page.goto(projectUrl("/project-settings"), {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Project Settings & Admin Controls",
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
        name: "Project Settings & Admin Controls",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByRole("heading", {
        name: "Project Details",
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await assertProjectRoute(
      page,
      "/project-settings"
    );

    await assertRegressionProjectVisible(page);

    await assertNoFatalPageErrors(pageErrors);
  });
});