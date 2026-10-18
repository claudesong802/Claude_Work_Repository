import { defineConfig, devices } from "@playwright/test";

// 크롬 실행 파일을 따로 줄 때(미리 깔린 브라우저를 쓰는 작업 환경) — CI 에서는 비워 둔다
const chromiumPath = process.env.PW_CHROMIUM_PATH;

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: "http://localhost:4173",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], launchOptions: chromiumPath ? { executablePath: chromiumPath } : {} },
    },
    // iPad 의 Chrome 도 속은 WebKit — 가장 가까운 대리
    { name: "webkit", use: { ...devices["Desktop Safari"] } },
    { name: "ipad-mini", use: { ...devices["iPad Mini"] } },
  ],
  webServer: {
    command: "npm run preview",
    url: "http://localhost:4173",
    reuseExistingServer: !process.env.CI,
  },
});
