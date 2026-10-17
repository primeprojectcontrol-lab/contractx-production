import path from "path";
import dotenv from "dotenv";
import {
  defineConfig,
  devices,
} from "@playwright/test";

dotenv.config({
  path: path.resolve(process.cwd(), ".env.local"),
});

const baseURL =
  process.env.PLAYWRIGHT_BASE_URL ||
  "http://127.0.0.1:3100";

const authFile =
  "playwright/.auth/regression-user.json";

export default defineConfig({
  testDir: "./tests",

  fullyParallel: false,

  forbidOnly: Boolean(process.env.CI),

  retries: process.env.CI ? 1 : 0,

  workers: 1,

  timeout: 60000,

  reporter: [
    ["list"],
    [
      "html",
      {
        outputFolder: "playwright-report",
        open: "never",
      },
    ],
  ],

  expect: {
    timeout: 15000,
  },

  use: {
    baseURL,

    trace: "retain-on-failure",

    screenshot: "only-on-failure",

    video: "retain-on-failure",

    actionTimeout: 15000,

    navigationTimeout: 30000,
  },

  projects: [
    {
      name: "setup",

      testMatch: /.*\.setup\.ts/,
    },

    {
      name: "public",

      testMatch: [
        /auth[\\/].*\.spec\.ts/,
        /smoke\.spec\.ts/,
      ],

      use: {
        ...devices["Desktop Chrome"],

        storageState: undefined,
      },
    },

    {
      name: "chromium",

      testIgnore: [
        /auth[\\/].*\.spec\.ts/,
        /smoke\.spec\.ts/,
        /.*\.setup\.ts/,
      ],

      use: {
        ...devices["Desktop Chrome"],

        storageState: authFile,
      },

      dependencies: [
        "setup",
      ],
    },
  ],

  webServer: {
    command:
      "npm run start -- -p 3100",

    url:
      "http://127.0.0.1:3100",

    reuseExistingServer: false,

    timeout: 120000,
  },
});