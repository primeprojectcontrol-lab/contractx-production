import { expect, Page } from "@playwright/test";

export const TEST_PROJECT_ID =
  process.env.CONTRACTX_TEST_PROJECT_ID || "";

export const TEST_PROJECT_NAME =
  "ContractX Automated Regression Project";

export const TEST_PROJECT_CODE =
  "REG-AUTO-01";

export function requireRegressionEnvironment() {
  if (!TEST_PROJECT_ID) {
    throw new Error(
      "CONTRACTX_TEST_PROJECT_ID is required for Stage 3 regression tests."
    );
  }
}

export function projectUrl(pathname: string) {
  requireRegressionEnvironment();

  return `${pathname}?project=${encodeURIComponent(
    TEST_PROJECT_ID
  )}`;
}

export async function assertProjectRoute(
  page: Page,
  expectedPathname: string
) {
  const url = new URL(page.url());

  expect(url.pathname).toBe(expectedPathname);

  expect(
    url.searchParams.get("project")
  ).toBe(TEST_PROJECT_ID);

  expect(url.pathname).not.toBe("/login");
  expect(url.pathname).not.toBe("/onboarding/Project");
}

export async function assertRegressionProjectVisible(
  page: Page
) {
  await expect(
    page.getByText(TEST_PROJECT_NAME, {
      exact: false,
    }).first()
  ).toBeVisible({
    timeout: 30000,
  });
}

export async function assertNoFatalPageErrors(
  pageErrors: string[]
) {
  expect(
    pageErrors,
    `Unexpected browser page errors:\n${pageErrors.join("\n")}`
  ).toEqual([]);
}

export function watchPageErrors(page: Page) {
  const pageErrors: string[] = [];

  page.on("pageerror", (error) => {
    pageErrors.push(error.message);
  });

  return pageErrors;
}
