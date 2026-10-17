import { test, expect } from "@playwright/test";

import {
  FOREIGN_PROJECT_ID,
  TEST_PROJECT_ID,
  expectNoRows,
  getSupabaseAccessToken,
  readJson,
  requireRlsEnvironment,
  restUrl,
  supabaseHeaders,
} from "./helpers";

test.describe(
  "Stage 5 - User Scoped RLS",
  () => {
    test.beforeEach(() => {
      requireRlsEnvironment();
    });

    test("task pins from foreign project are invisible", async ({
      page,
    }) => {
      const token =
        await getSupabaseAccessToken(page);

      const response =
        await page.request.get(
          restUrl("task_pins", {
            select:
              "id,tenant_id,project_id,task_id,user_id",

            project_id:
              `eq.${FOREIGN_PROJECT_ID}`,
          }),
          {
            headers:
              supabaseHeaders(token),

            failOnStatusCode: false,
          }
        );

      await expectNoRows(
        response,
        "task_pins foreign project"
      );
    });

    test("unrestricted task pins cannot leak foreign project rows", async ({
      page,
    }) => {
      const token =
        await getSupabaseAccessToken(page);

      const response =
        await page.request.get(
          restUrl("task_pins", {
            select:
              "id,tenant_id,project_id,task_id,user_id",
          }),
          {
            headers:
              supabaseHeaders(token),

            failOnStatusCode: false,
          }
        );

      expect(response.status()).toBe(200);

      const body =
        await readJson(response);

      expect(Array.isArray(body)).toBeTruthy();

      for (const row of body as Record<
        string,
        unknown
      >[]) {
        expect(
          String(row.project_id)
        ).toBe(TEST_PROJECT_ID);
      }
    });

    test("notifications from foreign project are invisible", async ({
      page,
    }) => {
      const token =
        await getSupabaseAccessToken(page);

      const response =
        await page.request.get(
          restUrl("project_notifications", {
            select:
              "id,tenant_id,project_id,user_id,notification_type",

            project_id:
              `eq.${FOREIGN_PROJECT_ID}`,
          }),
          {
            headers:
              supabaseHeaders(token),

            failOnStatusCode: false,
          }
        );

      await expectNoRows(
        response,
        "project_notifications foreign project"
      );
    });

    test("unrestricted notifications cannot leak foreign rows", async ({
      page,
    }) => {
      const token =
        await getSupabaseAccessToken(page);

      const response =
        await page.request.get(
          restUrl("project_notifications", {
            select:
              "id,tenant_id,project_id,user_id,notification_type",
          }),
          {
            headers:
              supabaseHeaders(token),

            failOnStatusCode: false,
          }
        );

      expect(response.status()).toBe(200);

      const body =
        await readJson(response);

      expect(Array.isArray(body)).toBeTruthy();

      for (const row of body as Record<
        string,
        unknown
      >[]) {
        expect(
          String(row.project_id)
        ).toBe(TEST_PROJECT_ID);
      }
    });
  }
);