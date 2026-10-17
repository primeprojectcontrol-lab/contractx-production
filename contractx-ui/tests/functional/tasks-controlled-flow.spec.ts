import {
  test,
  expect,
  Page,
} from "@playwright/test";

import {
  TEST_PROJECT_ID,
  TEST_TENANT_ID,
  bearerHeaders,
  getSupabaseAccessToken,
  requireApiRegressionEnvironment,
} from "../api/helpers";

const API = "/api/contractx";

const RUN_PREFIX = "CX-REGRESSION-AUTO";

function uniqueTaskTitle(label: string) {
  return `${RUN_PREFIX}-${label}-${Date.now()}`;
}

async function openTasks(page: Page) {
  await page.goto(
    `/tasks?project=${encodeURIComponent(TEST_PROJECT_ID)}`,
    {
      waitUntil: "domcontentloaded",
    }
  );

  await expect(
    page.getByRole("heading", {
      name: "Tasks",
      exact: true,
    })
  ).toBeVisible({
    timeout: 30000,
  });

  await expect(
    page
      .getByText(
        "ContractX Automated Regression Project",
        {
          exact: false,
        }
      )
      .first()
  ).toBeVisible({
    timeout: 30000,
  });

  // Do not perform any mutation while the active project context
  // is still resolving.
  await expect(
    page.getByText(
      "Loading selected project context...",
      {
        exact: true,
      }
    )
  ).toHaveCount(0, {
    timeout: 30000,
  });

  await expect(
    page.getByRole("heading", {
      name: "Project actions and deadlines",
      exact: true,
    })
  ).toBeVisible({
    timeout: 30000,
  });

  await expect(
    page.getByRole("button", {
      name: "Refresh",
      exact: true,
    })
  ).toBeVisible({
    timeout: 30000,
  });
}

async function showAdvancedFields(page: Page) {
  const titleInput = page.getByPlaceholder(
    "e.g. Issue EOT notice for late access"
  );

  if (
    await titleInput
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }

  const expandButton = page.getByRole(
    "button",
    {
      name: /Expand to Add Task/i,
    }
  );

  await expect(
    expandButton,
    "Expand to Add Task control should be available on Tasks page"
  ).toBeVisible({
    timeout: 15000,
  });

  await expandButton.click();

  await expect(
    titleInput,
    "Task title input should become visible after expanding the task form"
  ).toBeVisible({
    timeout: 15000,
  });
}

async function closeTaskMessage(
  page: Page,
  expectedMessage: string
) {
  const alertDialog =
    page.getByRole("alertdialog");

  const normalDialog =
    page.getByRole("dialog");

  let messageBox = alertDialog;

  if (
    !(await alertDialog
      .isVisible()
      .catch(() => false))
  ) {
    messageBox = normalDialog;
  }

  await expect(
    messageBox
  ).toBeVisible({
    timeout: 15000,
  });

  await expect(
    messageBox.getByText(
      expectedMessage,
      {
        exact: true,
      }
    )
  ).toBeVisible({
    timeout: 15000,
  });

  const okButton =
    messageBox.getByRole(
      "button",
      {
        name: "OK",
        exact: true,
      }
    );

  const closeButton =
    messageBox.getByRole(
      "button",
      {
        name: "Close",
        exact: true,
      }
    );

  if (
    await okButton
      .isVisible()
      .catch(() => false)
  ) {
    await okButton.click();
  } else if (
    await closeButton
      .isVisible()
      .catch(() => false)
  ) {
    await closeButton.click();
  } else {
    throw new Error(
      `Task message "${expectedMessage}" appeared but no supported close control was found.`
    );
  }

  await expect(
    messageBox
  ).toBeHidden({
    timeout: 15000,
  });
}

async function createTaskFromUi(
  page: Page,
  title: string
) {
  await openTasks(page);

  await showAdvancedFields(page);

  const titleInput =
    page.getByPlaceholder(
      "e.g. Issue EOT notice for late access"
    );

  await expect(
    titleInput
  ).toBeVisible({
    timeout: 15000,
  });

  await titleInput.fill(title);

  const descriptionInput =
    page.getByPlaceholder(
      "Action, evidence requirement, decision or follow-up."
    );

  await expect(
    descriptionInput
  ).toBeVisible({
    timeout: 15000,
  });

  await descriptionInput.fill(
    "Automated Stage 6 controlled regression task. Safe to delete."
  );

  const createButton =
    page.getByRole("button", {
      name: "Create Task",
      exact: true,
    });

  await expect(
    createButton
  ).toBeVisible({
    timeout: 15000,
  });

  const createResponsePromise =
    page.waitForResponse(
      (response) =>
        response
          .url()
          .includes(
            "/api/contractx/api/v1/tasks"
          ) &&
        response
          .request()
          .method() === "POST",
      {
        timeout: 15000,
      }
    );

  await createButton.click();

  const createResponse =
    await createResponsePromise;

  const createResponseText =
    await createResponse
      .text()
      .catch(() => "");

  console.log(
    `[FUNCTIONAL][CREATE API] HTTP ${createResponse.status()}`
  );

  console.log(
    `[FUNCTIONAL][CREATE API BODY] ${createResponseText}`
  );

  expect(
    createResponse.status(),
    `Task creation API failed: ${createResponseText}`
  ).toBeGreaterThanOrEqual(200);

  expect(
    createResponse.status(),
    `Task creation API failed: ${createResponseText}`
  ).toBeLessThan(300);

  await closeTaskMessage(
    page,
    "Task created."
  );

  await expect(
    page.getByRole("heading", {
      name: title,
      exact: true,
    })
  ).toBeVisible({
    timeout: 15000,
  });
}

async function locateTaskId(
  page: Page,
  accessToken: string,
  title: string
): Promise<string | null> {
  const qs =
    new URLSearchParams({
      tenant_id:
        TEST_TENANT_ID,
      project_id:
        TEST_PROJECT_ID,
      query: title,
    });

  const response =
    await page.request.get(
      `${API}/api/v1/tasks?${qs.toString()}`,
      {
        headers:
          bearerHeaders(
            accessToken
          ),

        failOnStatusCode:
          false,
      }
    );

  if (!response.ok()) {
    console.log(
      `[FUNCTIONAL][LOOKUP] ${title}: HTTP ${response.status()}`
    );

    return null;
  }

  const body =
    await response
      .json()
      .catch(() => ({}));

  const tasks =
    Array.isArray(body?.tasks)
      ? body.tasks
      : [];

  const match =
    tasks.find(
      (task: {
        id?: string;
        title?: string;
      }) =>
        task.title === title
    );

  return (
    match?.id || null
  );
}

async function cleanupTask(
  page: Page,
  accessToken: string,
  title: string
) {
  const taskId =
    await locateTaskId(
      page,
      accessToken,
      title
    );

  if (!taskId) {
    console.log(
      `[FUNCTIONAL][CLEANUP] No persisted task found for ${title}`
    );

    return;
  }

  const qs =
    new URLSearchParams({
      tenant_id:
        TEST_TENANT_ID,
      project_id:
        TEST_PROJECT_ID,
    });

  const response =
    await page.request.delete(
      `${API}/api/v1/tasks/${taskId}?${qs.toString()}`,
      {
        headers:
          bearerHeaders(
            accessToken
          ),

        failOnStatusCode:
          false,
      }
    );

  expect(
    [200, 204, 404],
    `Cleanup failed for task ${title}: HTTP ${response.status()}`
  ).toContain(
    response.status()
  );

  console.log(
    `[FUNCTIONAL][CLEANUP] ${title}: HTTP ${response.status()}`
  );
}

function taskCard(
  page: Page,
  title: string
) {
  return page
    .locator("article")
    .filter({
      has:
        page.getByRole(
          "heading",
          {
            name: title,
            exact: true,
          }
        ),
    });
}

test.describe(
  "Stage 6 - Controlled Task Functional Flows",
  () => {
    test.beforeEach(
      () => {
        requireApiRegressionEnvironment();
      }
    );

    test(
      "creates and persists a regression task",
      async ({
        page,
      }) => {
        const title =
          uniqueTaskTitle(
            "CREATE"
          );

        const accessToken =
          await getSupabaseAccessToken(
            page
          );

        try {
          await createTaskFromUi(
            page,
            title
          );

          const taskId =
            await locateTaskId(
              page,
              accessToken,
              title
            );

          expect(
            taskId,
            "Created task must persist in backend"
          ).toBeTruthy();

          console.log(
            `[FUNCTIONAL][CREATE] ${title}: PASS`
          );
        } finally {
          await cleanupTask(
            page,
            accessToken,
            title
          );
        }
      }
    );

    test(
      "edits an existing regression task",
      async ({
        page,
      }) => {
        const originalTitle =
          uniqueTaskTitle(
            "EDIT"
          );

        const updatedTitle =
          `${originalTitle}-UPDATED`;

        const accessToken =
          await getSupabaseAccessToken(
            page
          );

        try {
          await createTaskFromUi(
            page,
            originalTitle
          );

          const card =
            taskCard(
              page,
              originalTitle
            );

          await expect(
            card
          ).toBeVisible({
            timeout: 15000,
          });

          await card
            .getByRole(
              "button",
              {
                name: "Edit",
                exact: true,
              }
            )
            .click();

          const titleInput =
            page.getByPlaceholder(
              "e.g. Issue EOT notice for late access"
            );

          await expect(
            titleInput
          ).toBeVisible({
            timeout: 15000,
          });

          await titleInput.fill(
            updatedTitle
          );

          const updateButton =
            page.getByRole(
              "button",
              {
                name: "Update Task",
                exact: true,
              }
            );

          await expect(
            updateButton
          ).toBeVisible({
            timeout: 15000,
          });

          const updateResponsePromise =
            page.waitForResponse(
              (response) =>
                response
                  .url()
                  .includes(
                    "/api/contractx/api/v1/tasks/"
                  ) &&
                response
                  .request()
                  .method() === "PATCH",
              {
                timeout: 15000,
              }
            );

          await updateButton.click();

          const updateResponse =
            await updateResponsePromise;

          const updateBody =
            await updateResponse
              .text()
              .catch(() => "");

          console.log(
            `[FUNCTIONAL][EDIT API] HTTP ${updateResponse.status()}`
          );

          expect(
            updateResponse.status(),
            `Task update API failed: ${updateBody}`
          ).toBeGreaterThanOrEqual(
            200
          );

          expect(
            updateResponse.status(),
            `Task update API failed: ${updateBody}`
          ).toBeLessThan(
            300
          );

          await closeTaskMessage(
            page,
            "Task updated."
          );

          await expect(
            page.getByRole(
              "heading",
              {
                name:
                  updatedTitle,
                exact: true,
              }
            )
          ).toBeVisible({
            timeout: 15000,
          });

          await expect(
            page.getByRole(
              "heading",
              {
                name:
                  originalTitle,
                exact: true,
              }
            )
          ).toHaveCount(
            0
          );

          const taskId =
            await locateTaskId(
              page,
              accessToken,
              updatedTitle
            );

          expect(
            taskId,
            "Updated task should persist using the new title"
          ).toBeTruthy();

          console.log(
            `[FUNCTIONAL][EDIT] ${updatedTitle}: PASS`
          );
        } finally {
          await cleanupTask(
            page,
            accessToken,
            updatedTitle
          );

          await cleanupTask(
            page,
            accessToken,
            originalTitle
          );
        }
      }
    );

    test(
      "pins and unpins a regression task",
      async ({
        page,
      }) => {
        const title =
          uniqueTaskTitle(
            "PIN"
          );

        const accessToken =
          await getSupabaseAccessToken(
            page
          );

        try {
          await createTaskFromUi(
            page,
            title
          );

          let card =
            taskCard(
              page,
              title
            );

          await expect(
            card
          ).toBeVisible({
            timeout: 15000,
          });

          const pinButton =
            card.locator(
              'button[title="Pin task"]'
            );

          await expect(
            pinButton
          ).toBeVisible({
            timeout: 15000,
          });

          const pinResponsePromise =
            page.waitForResponse(
              (response) =>
                response
                  .url()
                  .includes(
                    "/pin"
                  ) &&
                response
                  .request()
                  .method() === "POST",
              {
                timeout: 15000,
              }
            );

          await pinButton.click();

          const pinResponse =
            await pinResponsePromise;

          console.log(
            `[FUNCTIONAL][PIN API] HTTP ${pinResponse.status()}`
          );

          expect(
            pinResponse.status()
          ).toBeGreaterThanOrEqual(
            200
          );

          expect(
            pinResponse.status()
          ).toBeLessThan(
            300
          );

          card =
            taskCard(
              page,
              title
            );

          const unpinButton =
            card.locator(
              'button[title="Unpin task"]'
            );

          await expect(
            unpinButton
          ).toBeVisible({
            timeout: 15000,
          });

          const unpinResponsePromise =
            page.waitForResponse(
              (response) =>
                response
                  .url()
                  .includes(
                    "/pin"
                  ) &&
                response
                  .request()
                  .method() === "DELETE",
              {
                timeout: 15000,
              }
            );

          await unpinButton.click();

          const unpinResponse =
            await unpinResponsePromise;

          console.log(
            `[FUNCTIONAL][UNPIN API] HTTP ${unpinResponse.status()}`
          );

          expect(
            unpinResponse.status()
          ).toBeGreaterThanOrEqual(
            200
          );

          expect(
            unpinResponse.status()
          ).toBeLessThan(
            300
          );

          await expect(
            taskCard(
              page,
              title
            ).locator(
              'button[title="Pin task"]'
            )
          ).toBeVisible({
            timeout: 15000,
          });

          console.log(
            `[FUNCTIONAL][PIN] ${title}: PASS`
          );
        } finally {
          await cleanupTask(
            page,
            accessToken,
            title
          );
        }
      }
    );

    test(
      "resolves a regression task with resolution evidence",
      async ({
        page,
      }) => {
        const title =
          uniqueTaskTitle(
            "RESOLVE"
          );

        const resolution =
          "Stage 6 automated controlled functional test completed successfully.";

        const accessToken =
          await getSupabaseAccessToken(
            page
          );

        try {
          await createTaskFromUi(
            page,
            title
          );

          const card =
            taskCard(
              page,
              title
            );

          await expect(
            card
          ).toBeVisible({
            timeout: 15000,
          });

          await card
            .getByRole(
              "button",
              {
                name:
                  "Resolve",
                exact: true,
              }
            )
            .click();

          const resolutionBox =
            page.getByPlaceholder(
              "Record what was completed, decided or issued."
            );

          await expect(
            resolutionBox
          ).toBeVisible({
            timeout: 15000,
          });

          await resolutionBox.fill(
            resolution
          );

          const resolveButton =
            page.getByRole(
              "button",
              {
                name:
                  "Resolve Task",
                exact: true,
              }
            );

          const resolveResponsePromise =
            page.waitForResponse(
              (response) =>
                response
                  .url()
                  .includes(
                    "/resolve"
                  ) &&
                response
                  .request()
                  .method() === "POST",
              {
                timeout: 15000,
              }
            );

          await resolveButton.click();

          const resolveResponse =
            await resolveResponsePromise;

          const resolveBody =
            await resolveResponse
              .text()
              .catch(() => "");

          console.log(
            `[FUNCTIONAL][RESOLVE API] HTTP ${resolveResponse.status()}`
          );

          expect(
            resolveResponse.status(),
            `Task resolve API failed: ${resolveBody}`
          ).toBeGreaterThanOrEqual(
            200
          );

          expect(
            resolveResponse.status(),
            `Task resolve API failed: ${resolveBody}`
          ).toBeLessThan(
            300
          );

          await closeTaskMessage(
            page,
            "Task resolved."
          );

          const resolvedCard =
            taskCard(
              page,
              title
            );

          await expect(
            resolvedCard
          ).toBeVisible({
            timeout: 15000,
          });

          await expect(
            resolvedCard.getByText(
              "Completed",
              {
                exact: true,
              }
            )
          ).toBeVisible({
            timeout: 15000,
          });

          await expect(
            resolvedCard.getByText(
              resolution,
              {
                exact: false,
              }
            )
          ).toBeVisible({
            timeout: 15000,
          });

          console.log(
            `[FUNCTIONAL][RESOLVE] ${title}: PASS`
          );
        } finally {
          await cleanupTask(
            page,
            accessToken,
            title
          );
        }
      }
    );

    test(
      "deletes a regression task and confirms persistence removal",
      async ({
        page,
      }) => {
        const title =
          uniqueTaskTitle(
            "DELETE"
          );

        const accessToken =
          await getSupabaseAccessToken(
            page
          );

        try {
          await createTaskFromUi(
            page,
            title
          );

          const card =
            taskCard(
              page,
              title
            );

          await expect(
            card
          ).toBeVisible({
            timeout: 15000,
          });

          page.once(
            "dialog",
            async (
              dialog
            ) => {
              expect(
                dialog.type()
              ).toBe(
                "confirm"
              );

              await dialog.accept();
            }
          );

          const deleteResponsePromise =
            page.waitForResponse(
              (response) =>
                response
                  .url()
                  .includes(
                    "/api/contractx/api/v1/tasks/"
                  ) &&
                response
                  .request()
                  .method() === "DELETE",
              {
                timeout: 15000,
              }
            );

          await card
            .getByRole(
              "button",
              {
                name:
                  "Delete",
                exact: true,
              }
            )
            .click();

          const deleteResponse =
            await deleteResponsePromise;

          const deleteBody =
            await deleteResponse
              .text()
              .catch(() => "");

          console.log(
            `[FUNCTIONAL][DELETE API] HTTP ${deleteResponse.status()}`
          );

          expect(
            deleteResponse.status(),
            `Task delete API failed: ${deleteBody}`
          ).toBeGreaterThanOrEqual(
            200
          );

          expect(
            deleteResponse.status(),
            `Task delete API failed: ${deleteBody}`
          ).toBeLessThan(
            300
          );

          await closeTaskMessage(
            page,
            "Task deleted."
          );

          await expect(
            page.getByRole(
              "heading",
              {
                name: title,
                exact: true,
              }
            )
          ).toHaveCount(
            0
          );

          const taskId =
            await locateTaskId(
              page,
              accessToken,
              title
            );

          expect(
            taskId,
            "Deleted task must not remain in backend"
          ).toBeNull();

          console.log(
            `[FUNCTIONAL][DELETE] ${title}: PASS`
          );
        } finally {
          await cleanupTask(
            page,
            accessToken,
            title
          );
        }
      }
    );
  }
);