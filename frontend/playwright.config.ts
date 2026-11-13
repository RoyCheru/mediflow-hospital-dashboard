import { defineConfig, devices } from "@playwright/test";

const databaseUrl = "sqlite+pysqlite:////tmp/mediflow-e2e.db";

const useWebServer = !process.env.PW_NO_WEBSERVER;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:8081",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: !useWebServer
    ? undefined
    : [
        {
          command: [
            `rm -f /tmp/mediflow-e2e.db`,
            `DATABASE_URL=${databaseUrl} FLASK_APP=wsgi .venv/bin/flask db upgrade`,
            `DATABASE_URL=${databaseUrl} FLASK_APP=wsgi .venv/bin/flask seed`,
            `DATABASE_URL=${databaseUrl} CORS_ORIGINS=http://localhost:8081 FLASK_APP=wsgi .venv/bin/flask run --port 5001`,
          ].join(" && "),
          cwd: "../backend",
          url: "http://localhost:5001/api/v1/health",
          reuseExistingServer: false,
          timeout: 120_000,
        },
        {
          command: "npm run dev -- --port 8081",
          url: "http://localhost:8081",
          reuseExistingServer: false,
          timeout: 120_000,
          env: { VITE_API_URL: "http://localhost:5001/api/v1" },
        },
      ],
});
