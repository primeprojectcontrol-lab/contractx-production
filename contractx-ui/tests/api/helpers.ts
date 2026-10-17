import { expect, Page } from "@playwright/test";

export const TEST_PROJECT_ID =
  process.env.CONTRACTX_TEST_PROJECT_ID || "";

export const TEST_TENANT_ID =
  process.env.CONTRACTX_TEST_TENANT_ID || "";

export const FAKE_PROJECT_ID =
  "00000000-0000-4000-8000-000000000999";

export const FAKE_TENANT_ID =
  "tenant_contractx_unauthorized_test";

export function requireApiRegressionEnvironment() {
  if (!TEST_PROJECT_ID) {
    throw new Error(
      "CONTRACTX_TEST_PROJECT_ID is required for Stage 4 API tests."
    );
  }

  if (!TEST_TENANT_ID) {
    throw new Error(
      "CONTRACTX_TEST_TENANT_ID is required for Stage 4 API tests."
    );
  }
}

/**
 * Retrieve the actual Supabase JWT used by ContractX itself.
 *
 * We intentionally do NOT inspect localStorage/cookies directly.
 *
 * The authenticated Documents page already calls protected ContractX
 * endpoints using:
 *
 * Authorization: Bearer <Supabase access token>
 *
 * Playwright observes one of those requests and reuses exactly the
 * same access token for Stage 4 API authorization testing.
 */
export async function getSupabaseAccessToken(
  page: Page
): Promise<string> {
  requireApiRegressionEnvironment();

  const authenticatedRequestPromise =
    page.waitForRequest(
      (request) => {
        const url = request.url();

        const authorization =
          request.headers()["authorization"] || "";

        const isContractXApi =
          url.includes("/api/contractx/api/v1/");

        const hasBearerToken =
          authorization.startsWith("Bearer ");

        return isContractXApi && hasBearerToken;
      },
      {
        timeout: 30000,
      }
    );

  await page.goto(
    `/documents?project=${encodeURIComponent(
      TEST_PROJECT_ID
    )}`,
    {
      waitUntil: "domcontentloaded",
    }
  );

  await expect(
    page.getByRole("heading", {
      name: "Documents",
      exact: true,
    })
  ).toBeVisible({
    timeout: 30000,
  });

  const authenticatedRequest =
    await authenticatedRequestPromise;

  const authorization =
    authenticatedRequest.headers()["authorization"] || "";

  if (!authorization.startsWith("Bearer ")) {
    throw new Error(
      "ContractX made the protected request, but no Bearer token was present."
    );
  }

  const accessToken = authorization
    .slice("Bearer ".length)
    .trim();

  if (!accessToken) {
    throw new Error(
      "ContractX Authorization header contained an empty Bearer token."
    );
  }

  return accessToken;
}

export function bearerHeaders(
  accessToken: string
): Record<string, string> {
  if (!accessToken.trim()) {
    throw new Error(
      "Cannot construct Authorization header from an empty access token."
    );
  }

  return {
    Authorization: `Bearer ${accessToken}`,
  };
}

export async function expectAllowedStatus(
  status: number,
  endpoint: string
) {
  expect(
    status,
    `${endpoint} should allow the authenticated regression project`
  ).toBeGreaterThanOrEqual(200);

  expect(
    status,
    `${endpoint} returned unexpected server/error status`
  ).toBeLessThan(300);
}

/**
 * Authorization rejection may legitimately use:
 *
 * 401 = no valid authentication
 * 403 = authenticated but forbidden
 * 404 = protected resource deliberately hidden
 *
 * For Stage 4, any HTTP 200 from an unauthorized project/tenant
 * would be considered an authorization defect.
 */
export async function expectDeniedStatus(
  status: number,
  endpoint: string
) {
  expect(
    [401, 403, 404],
    `${endpoint} unexpectedly returned HTTP ${status}`
  ).toContain(status);
}