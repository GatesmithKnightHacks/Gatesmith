import { defineConfig, devices } from '@playwright/test'

/** End-to-end flow at the design size. Video and traces show the motion for review. */
export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 90_000,
  outputDir: 'test-results',
  reporter: [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: process.env.BASE ?? 'http://localhost:5173',
    viewport: { width: 1440, height: 900 },
    video: { mode: 'on', size: { width: 1440, height: 900 } },
    trace: 'retain-on-failure',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } } }],
  webServer: {
    command: 'npx vite --port 5173 --strictPort',
    url: 'http://localhost:5173',
    reuseExistingServer: true,
  },
})
