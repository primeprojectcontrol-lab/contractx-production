import {
  APIResponse,
  expect,
  Page,
  TestInfo,
} from "@playwright/test";

export const TEST_PROJECT_ID =
  process.env.CONTRACTX_TEST_PROJECT_ID || "";

export const TEST_TENANT_ID =
  process.env.CONTRACTX_TEST_TENANT_ID || "";

/**
 * Real ContractX project belonging to another tenant.
 *
 * IMPORTANT:
 * The regression user is not a member of this project.
 */
export const FOREIGN_PROJECT_ID =
  "d2b1a957-6d56-4e24-801d-15f7802214b0";

export const FOREIGN_TENANT_ID =
  "tenant_demo_01";

export const SUPABASE_URL =
  process.env.NEXT_PUBLIC_SUPABASE_URL || "";

/**
 * Support either the legacy anon key or the newer publishable key.
 */
export const SUPABASE_PUBLIC_KEY =
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_KEY ||
  "";

export function requireRlsEnvironment() {
  const missing: string[] = [];

  if (!TEST_PROJECT_ID) {
    missing.push("CONTRACTX_TEST_PROJECT_ID");
  }

  if (!TEST_TENANT_ID) {
    missing.push("CONTRACTX_TEST_TENANT_ID");
  }

  if (!SUPABASE_URL) {
    missing.push("NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!SUPABASE_PUBLIC_KEY) {
    missing.push(
      "NEXT_PUBLIC_SUPABASE_ANON_KEY or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"
    );
  }

  if (missing.length > 0) {
    throw new Error(
      `Missing Stage 5 environment variables: ${missing.join(", ")}`
    );
  }
}

/**
 * Capture the same authenticated JWT that the ContractX browser
 * application uses for protected API calls.
 *
 * We do not inspect storage serialization and we never use service_role.
 */
export async function getSupabaseAccessToken(
  page: Page
): Promise<string> {
  requireRlsEnvironment();

  const authenticatedRequestPromise =
    page.waitForRequest(
      (request) => {
        const url = request.url();

        const authorization =
          request.headers()["authorization"] || "";

        return (
          url.includes("/api/contractx/api/v1/") &&
          authorization.startsWith("Bearer ")
        );
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

  const request =
    await authenticatedRequestPromise;

  const authorization =
    request.headers()["authorization"] || "";

  if (!authorization.startsWith("Bearer ")) {
    throw new Error(
      "Unable to capture authenticated ContractX Bearer token."
    );
  }

  const token = authorization
    .slice("Bearer ".length)
    .trim();

  if (!token) {
    throw new Error(
      "Captured ContractX Bearer token was empty."
    );
  }

  return token;
}

export function supabaseHeaders(
  accessToken: string
): Record<string, string> {
  if (!accessToken) {
    throw new Error(
      "Supabase access token is required."
    );
  }

  return {
    apikey: SUPABASE_PUBLIC_KEY,
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

export function restUrl(
  table: string,
  params?: Record<string, string>
) {
  const url = new URL(
    `/rest/v1/${table}`,
    SUPABASE_URL
  );

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  return url.toString();
}

export function rpcUrl(functionName: string) {
  return new URL(
    `/rest/v1/rpc/${functionName}`,
    SUPABASE_URL
  ).toString();
}

export async function readJson(
  response: APIResponse
): Promise<unknown> {
  const text = await response.text();

  if (!text.trim()) {
    return null;
  }

  try {
    return JSON.parse(text);
  } catch {
    throw new Error(
      `Expected JSON response but received: ${text.slice(
        0,
        500
      )}`
    );
  }
}

export function expectArray(
  value: unknown
): asserts value is Record<string, unknown>[] {
  expect(Array.isArray(value)).toBeTruthy();
}

/**
 * RLS SELECT denial normally returns HTTP 200 with an empty array.
 *
 * That is expected behaviour:
 *
 * PostgreSQL RLS hides rows rather than necessarily producing 403.
 */
export async function expectNoRows(
  response: APIResponse,
  label: string
) {
  expect(
    response.status(),
    `${label} REST request should execute successfully`
  ).toBe(200);

  const body = await readJson(response);

  expectArray(body);

  expect(
    body,
    `${label} leaked rows through RLS`
  ).toHaveLength(0);
}

export async function expectRowsOnlyForProject(
  response: APIResponse,
  projectId: string,
  label: string
) {
  expect(
    response.status(),
    `${label} REST request failed`
  ).toBe(200);

  const body = await readJson(response);

  expectArray(body);

  for (const row of body) {
    expect(
      String(row.project_id || row.id || ""),
      `${label} returned a row outside the authorized project`
    ).toBe(projectId);
  }

  return body;
}

/**
 * Safe Stage 5 test logging.
 *
 * Never log JWTs, API keys or document contents.
 */
export function logRlsResult(
  testInfo: TestInfo,
  message: string
) {
  console.log(
    `[RLS][${testInfo.title}] ${message}`
  );
}