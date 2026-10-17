import { test, expect } from "@playwright/test";

import {
  TEST_PROJECT_ID,
  assertProjectRoute,
  projectUrl,
  requireRegressionEnvironment,
} from "./helpers";

test.describe("Stage 3 - Dashboard module navigation", () => {
  test.beforeEach(() => {
    requireRegressionEnvironment();
  });

  const modules = [
    {
      pathname: "/ask-contractx",
      heading: "Ask ContractX",
    },
    {
      pathname: "/bespoke-review",
      heading: "Bespoke Review",
    },
    {
      pathname: "/delay-analytics",
      heading: "Delay Analysis",
    },
    {
      pathname: "/claims",
      heading: "Claims & Resolution",
    },
    {
      pathname: "/tasks",
      heading: "Tasks",
    },
    {
      pathname: "/documents",
      heading: "Documents",
    },
    {
      pathname: "/project-settings",
      heading: "Project Settings & Admin Controls",
    },
  ] as const;

  for (const module of modules) {
    test(`dashboard opens ${module.pathname} with project context`, async ({
      page,
    }) => {
      await page.goto(projectUrl("/dashboard"), {
        waitUntil: "domcontentloaded",
      });

      await expect(
        page.getByText("Project Dashboard", {
          exact: true,
        })
      ).toBeVisible({
        timeout: 30000,
      });

      const href =
        `${module.pathname}?project=${TEST_PROJECT_ID}`;

      const link = page
        .locator(`a[href="${href}"]`)
        .first();

      await expect(link).toBeVisible({
        timeout: 30000,
      });

      await link.click();

      await page.waitForURL(
        (url) =>
          url.pathname === module.pathname &&
          url.searchParams.get("project") ===
            TEST_PROJECT_ID,
        {
          timeout: 30000,
        }
      );

      await expect(
        page.getByRole("heading", {
          name: module.heading,
          exact: true,
        })
      ).toBeVisible({
        timeout: 30000,
      });

      await assertProjectRoute(
        page,
        module.pathname
      );
    });
  }
});