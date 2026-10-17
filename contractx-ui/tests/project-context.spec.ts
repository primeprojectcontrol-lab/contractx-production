import { test, expect } from "@playwright/test";

const TEST_PROJECT_ID = process.env.CONTRACTX_TEST_PROJECT_ID;

const TEST_PROJECT_NAME = "ContractX Automated Regression Project";
const TEST_PROJECT_CODE = "REG-AUTO-01";

test.describe("ContractX project context regression", () => {
  test.beforeEach(async () => {
    if (!TEST_PROJECT_ID) {
      throw new Error(
        "CONTRACTX_TEST_PROJECT_ID is required for project-context regression."
      );
    }
  });

  test("portfolio loads the authenticated regression project", async ({
    page,
  }) => {
    await page.goto("/portfolio", {
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: "Portfolio Control Centre",
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByText(TEST_PROJECT_NAME, {
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByText(TEST_PROJECT_CODE, {
        exact: true,
      })
    ).toBeVisible();

    expect(page.url()).toContain("/portfolio");
  });

  test("portfolio project selection persists the exact project UUID", async ({
    page,
  }) => {
    await page.goto("/portfolio", {
      waitUntil: "domcontentloaded",
    });

    const projectCard = page
      .locator("article")
      .filter({
        hasText: TEST_PROJECT_NAME,
      })
      .first();

    await expect(projectCard).toBeVisible({
      timeout: 30000,
    });

    const selectButton = projectCard.getByRole("button", {
      name: /Select Project|Selected Project/,
    });

    await expect(selectButton).toBeVisible();

    const alreadySelected =
      (await selectButton.getAttribute("aria-pressed")) === "true";

    if (!alreadySelected) {
      await selectButton.click();
    }

    await expect(
      projectCard.getByRole("button", {
        name: "Selected Project",
      })
    ).toHaveAttribute("aria-pressed", "true");

    const storedProjectId = await page.evaluate(() =>
      window.localStorage.getItem(
        "contractx-selected-project"
      )
    );

    expect(storedProjectId).toBe(TEST_PROJECT_ID);

    await expect(
      page.getByText(
        `${TEST_PROJECT_NAME} · ${TEST_PROJECT_CODE}`,
        {
          exact: true,
        }
      )
    ).toBeVisible();
  });

  test("selected portfolio project exposes correct module URLs", async ({
    page,
  }) => {
    await page.goto("/portfolio", {
      waitUntil: "domcontentloaded",
    });

    const projectCard = page
      .locator("article")
      .filter({
        hasText: TEST_PROJECT_NAME,
      })
      .first();

    await expect(projectCard).toBeVisible({
      timeout: 30000,
    });

    const selectButton = projectCard.getByRole("button", {
      name: /Select Project|Selected Project/,
    });

    const alreadySelected =
      (await selectButton.getAttribute("aria-pressed")) === "true";

    if (!alreadySelected) {
      await selectButton.click();
    }

    const expectedLinks = [
      ["Open Selected Project", "/dashboard"],
      ["Dashboard", "/dashboard"],
      ["Ask ContractX", "/ask-contractx"],
      ["Bespoke Review", "/bespoke-review"],
      ["Delay & Forensic", "/delay-analytics"],
      ["Claims & Resolution", "/claims"],
      ["Tasks", "/tasks"],
      ["Documents", "/documents"],
      ["Settings", "/project-settings"],
    ] as const;

    for (const [label, pathname] of expectedLinks) {
      const link = projectCard.getByRole("link", {
        name: label,
        exact: true,
      });

      await expect(link).toBeVisible();

      await expect(link).toHaveAttribute(
        "href",
        `${pathname}?project=${TEST_PROJECT_ID}`
      );
    }
  });

  test("opening selected project reaches dashboard with exact project context", async ({
    page,
  }) => {
    await page.goto("/portfolio", {
      waitUntil: "domcontentloaded",
    });

    const projectCard = page
      .locator("article")
      .filter({
        hasText: TEST_PROJECT_NAME,
      })
      .first();

    await expect(projectCard).toBeVisible({
      timeout: 30000,
    });

    const selectButton = projectCard.getByRole("button", {
      name: /Select Project|Selected Project/,
    });

    const alreadySelected =
      (await selectButton.getAttribute("aria-pressed")) === "true";

    if (!alreadySelected) {
      await selectButton.click();
    }

    await projectCard
      .getByRole("link", {
        name: "Open Selected Project",
        exact: true,
      })
      .click();

    await page.waitForURL(
      (url) =>
        url.pathname === "/dashboard" &&
        url.searchParams.get("project") ===
          TEST_PROJECT_ID,
      {
        timeout: 30000,
      }
    );

    const dashboardUrl = new URL(page.url());

    expect(dashboardUrl.pathname).toBe("/dashboard");

    expect(
      dashboardUrl.searchParams.get("project")
    ).toBe(TEST_PROJECT_ID);

    await expect(
      page.getByText("Project Dashboard", {
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByRole("heading", {
        name: TEST_PROJECT_NAME,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByText(TEST_PROJECT_CODE, {
        exact: true,
      })
    ).toBeVisible();
  });

  test("dashboard preserves project UUID across project module links", async ({
    page,
  }) => {
    await page.goto(
      `/dashboard?project=${TEST_PROJECT_ID}`,
      {
        waitUntil: "domcontentloaded",
      }
    );

    await expect(
      page.getByText("Project Dashboard", {
        exact: true,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await expect(
      page.getByRole("heading", {
        name: TEST_PROJECT_NAME,
      })
    ).toBeVisible();

    const expectedPaths = [
      "/documents",
      "/project-settings",
      "/delay-analytics",
      "/tasks",
      "/ask-contractx",
      "/bespoke-review",
      "/claims",
    ];

    for (const pathname of expectedPaths) {
      const href = `${pathname}?project=${TEST_PROJECT_ID}`;

      await expect(
        page.locator(`a[href="${href}"]`).first()
      ).toBeVisible();
    }
  });

  test("dashboard does not lose project context after reload", async ({
    page,
  }) => {
    await page.goto(
      `/dashboard?project=${TEST_PROJECT_ID}`,
      {
        waitUntil: "domcontentloaded",
      }
    );

    await expect(
      page.getByRole("heading", {
        name: TEST_PROJECT_NAME,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    await page.reload({
      waitUntil: "domcontentloaded",
    });

    await expect(
      page.getByRole("heading", {
        name: TEST_PROJECT_NAME,
      })
    ).toBeVisible({
      timeout: 30000,
    });

    const reloadedUrl = new URL(page.url());

    expect(reloadedUrl.pathname).toBe("/dashboard");

    expect(
      reloadedUrl.searchParams.get("project")
    ).toBe(TEST_PROJECT_ID);
  });
});