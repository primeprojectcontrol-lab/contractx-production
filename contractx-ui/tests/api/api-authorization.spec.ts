import { test, expect } from "@playwright/test";

import {
  TEST_PROJECT_ID,
  TEST_TENANT_ID,
  FAKE_PROJECT_ID,
  FAKE_TENANT_ID,
  bearerHeaders,
  expectAllowedStatus,
  expectDeniedStatus,
  getSupabaseAccessToken,
  requireApiRegressionEnvironment,
} from "./helpers";

const API = "/api/contractx";

type ProtectedEndpoint = {
  name: string;

  buildUrl: (
    tenantId: string,
    projectId: string
  ) => string;
};

/**
 * Stage 4 intentionally contains only GET endpoints.
 *
 * No data mutation.
 * No AI inference.
 * No schedule calculation.
 * No upload.
 * No delete.
 */
const protectedEndpoints: ProtectedEndpoint[] = [
  {
    name: "Model Policy",

    buildUrl: (tenantId, projectId) =>
      `${API}/api/v1/models/project?${new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId,
      }).toString()}`,
  },

  {
    name: "Vault Summary",

    buildUrl: (tenantId, projectId) =>
      `${API}/api/v1/vault/summary?${new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId,
      }).toString()}`,
  },

  {
    name: "Vault Documents",

    buildUrl: (tenantId, projectId) =>
      `${API}/api/v1/vault/documents?${new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId,
        page: "1",
        page_size: "5",
        sort_by: "document_date",
        sort_direction: "desc",
      }).toString()}`,
  },

  {
    name: "Tasks",

    buildUrl: (tenantId, projectId) =>
      `${API}/api/v1/tasks?${new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId,
      }).toString()}`,
  },

  {
    name: "Task Summary",

    buildUrl: (tenantId, projectId) =>
      `${API}/api/v1/tasks/summary?${new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId,
      }).toString()}`,
  },

  {
    name: "Task Members",

    buildUrl: (tenantId, projectId) =>
      `${API}/api/v1/tasks/members?${new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId,
      }).toString()}`,
  },

  {
    name: "Engine 2 Programme Register",

    buildUrl: (tenantId, projectId) =>
      `${API}/api/v1/engine2/programmes?${new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId,
        include_archived: "false",
      }).toString()}`,
  },

  {
    name: "Engine 2 Analysis Register",

    buildUrl: (tenantId, projectId) =>
      `${API}/api/v1/engine2/analyses?${new URLSearchParams({
        tenant_id: tenantId,
        project_id: projectId,
        limit: "3",
      }).toString()}`,
  },
];

test.describe("Stage 4 - Protected API Authorization", () => {
  test.beforeEach(() => {
    requireApiRegressionEnvironment();
  });

  test.describe("authenticated valid project", () => {
    for (const endpoint of protectedEndpoints) {
      test(`${endpoint.name} allows authorized project access`, async ({
        page,
      }) => {
        const accessToken =
          await getSupabaseAccessToken(page);

        const url = endpoint.buildUrl(
          TEST_TENANT_ID,
          TEST_PROJECT_ID
        );

        const response = await page.request.get(url, {
          headers: bearerHeaders(accessToken),
          failOnStatusCode: false,
        });

        const status = response.status();

        console.log(
          `[AUTHORIZED] ${endpoint.name}: HTTP ${status}`
        );

        await expectAllowedStatus(
          status,
          endpoint.name
        );
      });
    }
  });

  test.describe("missing bearer token", () => {
    for (const endpoint of protectedEndpoints) {
      test(`${endpoint.name} rejects missing Authorization header`, async ({
        page,
      }) => {
        const url = endpoint.buildUrl(
          TEST_TENANT_ID,
          TEST_PROJECT_ID
        );

        const response = await page.request.get(url, {
          failOnStatusCode: false,
        });

        const status = response.status();

        console.log(
          `[NO TOKEN] ${endpoint.name}: HTTP ${status}`
        );

        await expectDeniedStatus(
          status,
          endpoint.name
        );
      });
    }
  });

  test.describe("authenticated user with unauthorized project", () => {
    for (const endpoint of protectedEndpoints) {
      test(`${endpoint.name} rejects foreign project context`, async ({
        page,
      }) => {
        const accessToken =
          await getSupabaseAccessToken(page);

        const url = endpoint.buildUrl(
          TEST_TENANT_ID,
          FAKE_PROJECT_ID
        );

        const response = await page.request.get(url, {
          headers: bearerHeaders(accessToken),
          failOnStatusCode: false,
        });

        const status = response.status();

        console.log(
          `[FOREIGN PROJECT] ${endpoint.name}: HTTP ${status}`
        );

        expect(
          status,
          `${endpoint.name} exposed an unauthorized project`
        ).not.toBe(200);

        await expectDeniedStatus(
          status,
          endpoint.name
        );
      });
    }
  });

  test.describe("authenticated user with unauthorized tenant", () => {
    for (const endpoint of protectedEndpoints) {
      test(`${endpoint.name} rejects foreign tenant context`, async ({
        page,
      }) => {
        const accessToken =
          await getSupabaseAccessToken(page);

        const url = endpoint.buildUrl(
          FAKE_TENANT_ID,
          TEST_PROJECT_ID
        );

        const response = await page.request.get(url, {
          headers: bearerHeaders(accessToken),
          failOnStatusCode: false,
        });

        const status = response.status();

        console.log(
          `[FOREIGN TENANT] ${endpoint.name}: HTTP ${status}`
        );

        expect(
          status,
          `${endpoint.name} exposed an unauthorized tenant`
        ).not.toBe(200);

        await expectDeniedStatus(
          status,
          endpoint.name
        );
      });
    }
  });
});