import { test, expect } from "@playwright/test";

import {
  FOREIGN_PROJECT_ID,
  TEST_PROJECT_ID,
  getSupabaseAccessToken,
  readJson,
  requireRlsEnvironment,
  rpcUrl,
  supabaseHeaders,
} from "./helpers";

test.describe(
  "Stage 5 - SECURITY DEFINER RPC Isolation",
  () => {
    test.beforeEach(() => {
      requireRlsEnvironment();
    });

    test("project admin member RPC works for own project", async ({
      page,
    }) => {
      const token =
        await getSupabaseAccessToken(page);

      const response =
        await page.request.post(
          rpcUrl("project_admin_list_members"),
          {
            headers:
              supabaseHeaders(token),

            data: {
              p_project_id:
                TEST_PROJECT_ID,
            },

            failOnStatusCode: false,
          }
        );

      expect(
        response.status(),
        "Own-project member RPC should be authorized"
      ).toBeGreaterThanOrEqual(200);

      expect(
        response.status(),
        "Own-project member RPC returned an unexpected failure"
      ).toBeLessThan(300);

      const body =
        await readJson(response);

      expect(
        Array.isArray(body),
        "Member RPC should return an array"
      ).toBeTruthy();

      console.log(
        `[RPC][OWN PROJECT] project_admin_list_members: HTTP ${response.status()}`
      );
    });

    test("project admin member RPC denies foreign project", async ({
      page,
    }) => {
      const token =
        await getSupabaseAccessToken(page);

      const response =
        await page.request.post(
          rpcUrl("project_admin_list_members"),
          {
            headers:
              supabaseHeaders(token),

            data: {
              p_project_id:
                FOREIGN_PROJECT_ID,
            },

            failOnStatusCode: false,
          }
        );

      console.log(
        `[RPC][FOREIGN PROJECT] project_admin_list_members: HTTP ${response.status()}`
      );

      expect(
        response.status(),
        "SECURITY DEFINER member RPC must not expose foreign-project members"
      ).toBeGreaterThanOrEqual(400);
    });

    test("project invitation RPC works for own project", async ({
      page,
    }) => {
      const token =
        await getSupabaseAccessToken(page);

      const response =
        await page.request.post(
          rpcUrl("project_admin_list_invitations"),
          {
            headers:
              supabaseHeaders(token),

            data: {
              p_project_id:
                TEST_PROJECT_ID,
            },

            failOnStatusCode: false,
          }
        );

      expect(
        response.status(),
        "Own-project invitation RPC should be authorized"
      ).toBeGreaterThanOrEqual(200);

      expect(
        response.status(),
        "Own-project invitation RPC returned an unexpected failure"
      ).toBeLessThan(300);

      const body =
        await readJson(response);

      expect(
        Array.isArray(body),
        "Invitation RPC should return an array"
      ).toBeTruthy();

      console.log(
        `[RPC][OWN PROJECT] project_admin_list_invitations: HTTP ${response.status()}`
      );
    });

    test("project invitation RPC denies foreign project", async ({
      page,
    }) => {
      const token =
        await getSupabaseAccessToken(page);

      const response =
        await page.request.post(
          rpcUrl("project_admin_list_invitations"),
          {
            headers:
              supabaseHeaders(token),

            data: {
              p_project_id:
                FOREIGN_PROJECT_ID,
            },

            failOnStatusCode: false,
          }
        );

      console.log(
        `[RPC][FOREIGN PROJECT] project_admin_list_invitations: HTTP ${response.status()}`
      );

      expect(
        response.status(),
        "SECURITY DEFINER invitation RPC must not expose another project's invitations"
      ).toBeGreaterThanOrEqual(400);
    });
  }
);