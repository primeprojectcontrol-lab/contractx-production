import { test } from "@playwright/test";

import {
  expectNoRows,
  getSupabaseAccessToken,
  requireRlsEnvironment,
  restUrl,
  supabaseHeaders,
} from "./helpers";

const denyByDefaultTables = [
  "project_invitations",
  "entitlements",
  "tenant_ai_plan_assignments",
  "ai_usage_ledger",
];

test.describe(
  "Stage 5 - Deny By Default Tables",
  () => {
    test.beforeEach(() => {
      requireRlsEnvironment();
    });

    for (const table of denyByDefaultTables) {
      test(`${table} does not expose direct rows to regression user`, async ({
        page,
      }) => {
        const token =
          await getSupabaseAccessToken(page);

        const response =
          await page.request.get(
            restUrl(table, {
              select: "*",
              limit: "20",
            }),
            {
              headers:
                supabaseHeaders(token),

              failOnStatusCode: false,
            }
          );

        await expectNoRows(
          response,
          `${table} direct REST access`
        );
      });
    }
  }
);