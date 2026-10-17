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

type RlsTable = {
  name: string;

  projectColumn: string;

  select: string;
};

const projectScopedTables: RlsTable[] = [
  {
    name: "project_documents",
    projectColumn: "project_id",
    select:
      "id,tenant_id,project_id,file_name",
  },

  {
    name: "project_tasks",
    projectColumn: "project_id",
    select:
      "id,tenant_id,project_id,title,status",
  },

  {
    name: "contract_profiles",
    projectColumn: "project_id",
    select:
      "id,tenant_id,project_id,contract_type",
  },

  {
    name: "project_settings",
    projectColumn: "project_id",
    select:
      "project_id,tenant_id,project_timezone",
  },

  {
    name: "schedules",
    projectColumn: "project_id",
    select:
      "id,tenant_id,project_id,file_name,schedule_type",
  },

  {
    name: "delay_events",
    projectColumn: "project_id",
    select:
      "id,tenant_id,project_id,event_reference,event_title",
  },

  {
    name: "delay_event_analyses",
    projectColumn: "project_id",
    select:
      "id,tenant_id,project_id,relation_type",
  },

  {
    name: "evidence_nodes",
    projectColumn: "project_id",
    select:
      "id,tenant_id,project_id,node_type,title",
  },

  {
    name: "evidence_edges",
    projectColumn: "project_id",
    select:
      "id,tenant_id,project_id,edge_type",
  },
];

test.describe(
  "Stage 5 - Project Data RLS",
  () => {
    test.beforeEach(() => {
      requireRlsEnvironment();
    });

    for (const table of projectScopedTables) {
      test(`${table.name} hides foreign project rows`, async ({
        page,
      }) => {
        const token =
          await getSupabaseAccessToken(page);

        const response =
          await page.request.get(
            restUrl(table.name, {
              select: table.select,

              [table.projectColumn]:
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
          `${table.name} foreign project`
        );
      });
    }

    for (const table of projectScopedTables) {
      test(`${table.name} unrestricted query cannot leak foreign projects`, async ({
        page,
      }) => {
        const token =
          await getSupabaseAccessToken(page);

        const response =
          await page.request.get(
            restUrl(table.name, {
              select: table.select,
            }),
            {
              headers:
                supabaseHeaders(token),

              failOnStatusCode: false,
            }
          );

        expect(
          response.status()
        ).toBe(200);

        const body =
          await readJson(response);

        expect(
          Array.isArray(body)
        ).toBeTruthy();

        const rows =
          body as Record<
            string,
            unknown
          >[];

        for (const row of rows) {
          expect(
            String(row.project_id),
            `${table.name} leaked another project's row`
          ).toBe(TEST_PROJECT_ID);
        }
      });
    }
  }
);