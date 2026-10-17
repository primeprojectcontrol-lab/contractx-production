import { test, expect } from "@playwright/test";

import {
  FOREIGN_PROJECT_ID,
  TEST_PROJECT_ID,
  getSupabaseAccessToken,
  readJson,
  requireRlsEnvironment,
  restUrl,
  supabaseHeaders,
} from "./helpers";

test.describe("Stage 5 - Core Project RLS", () => {
  test.beforeEach(() => {
    requireRlsEnvironment();
  });

  test("regression user can read own project", async ({
    page,
  }) => {
    const token =
      await getSupabaseAccessToken(page);

    const response = await page.request.get(
      restUrl("projects", {
        select:
          "id,tenant_id,project_name,project_code,status",

        id: `eq.${TEST_PROJECT_ID}`,
      }),
      {
        headers: supabaseHeaders(token),
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(200);

    const body = await readJson(response);

    expect(Array.isArray(body)).toBeTruthy();

    const rows = body as Record<
      string,
      unknown
    >[];

    expect(rows).toHaveLength(1);

    expect(rows[0].id).toBe(
      TEST_PROJECT_ID
    );
  });

  test("foreign project is invisible through projects RLS", async ({
    page,
  }) => {
    const token =
      await getSupabaseAccessToken(page);

    const response = await page.request.get(
      restUrl("projects", {
        select:
          "id,tenant_id,project_name,project_code,status",

        id: `eq.${FOREIGN_PROJECT_ID}`,
      }),
      {
        headers: supabaseHeaders(token),
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(200);

    const body = await readJson(response);

    expect(body).toEqual([]);
  });

  test("unrestricted projects query exposes only projects user may access", async ({
    page,
  }) => {
    const token =
      await getSupabaseAccessToken(page);

    const response = await page.request.get(
      restUrl("projects", {
        select: "id,tenant_id,project_name",
      }),
      {
        headers: supabaseHeaders(token),
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(200);

    const body = await readJson(response);

    expect(Array.isArray(body)).toBeTruthy();

    const rows = body as Record<
      string,
      unknown
    >[];

    expect(rows.length).toBeGreaterThan(0);

    expect(
      rows.some(
        (row) =>
          String(row.id) ===
          TEST_PROJECT_ID
      )
    ).toBeTruthy();

    expect(
      rows.some(
        (row) =>
          String(row.id) ===
          FOREIGN_PROJECT_ID
      )
    ).toBeFalsy();
  });

  test("foreign project membership rows are invisible", async ({
    page,
  }) => {
    const token =
      await getSupabaseAccessToken(page);

    const response = await page.request.get(
      restUrl("project_users", {
        select:
          "id,project_id,user_id,role,status",

        project_id: `eq.${FOREIGN_PROJECT_ID}`,
      }),
      {
        headers: supabaseHeaders(token),
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(200);

    const body = await readJson(response);

    expect(body).toEqual([]);
  });

  test("own project membership is visible", async ({
    page,
  }) => {
    const token =
      await getSupabaseAccessToken(page);

    const response = await page.request.get(
      restUrl("project_users", {
        select:
          "id,project_id,user_id,role,status",

        project_id: `eq.${TEST_PROJECT_ID}`,
      }),
      {
        headers: supabaseHeaders(token),
        failOnStatusCode: false,
      }
    );

    expect(response.status()).toBe(200);

    const body = await readJson(response);

    expect(Array.isArray(body)).toBeTruthy();

    const rows = body as Record<
      string,
      unknown
    >[];

    expect(rows.length).toBeGreaterThan(0);

    for (const row of rows) {
      expect(row.project_id).toBe(
        TEST_PROJECT_ID
      );
    }
  });
});