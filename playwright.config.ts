import { defineConfig, devices } from '@playwright/test'

const port = 4173
// GitHub Pages と同じサブパスで配信して、相対パスの解決まで本番と同じ形で確かめる
const basePath = '/hihoukan-calculator/'
// 指定があれば、ローカルではなくその URL（本番の GitHub Pages など）に対して流す
const liveUrl = process.env.PLAYWRIGHT_BASE_URL

export default defineConfig({
  testDir: 'e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: liveUrl ?? `http://localhost:${port}${basePath}`,
    locale: 'ja-JP',
    timezoneId: 'Asia/Tokyo',
    trace: 'retain-on-failure',
  },
  webServer: liveUrl
    ? undefined
    : {
        command: `npm run build && npx vite preview --port ${port} --strictPort --base ${basePath}`,
        url: `http://localhost:${port}${basePath}`,
        reuseExistingServer: !process.env.CI,
        timeout: 120_000,
      },
  // お店で使う端末（iPhone の Safari と Android の Chrome）をエミュレートする
  projects: [
    { name: 'iPhone', use: { ...devices['iPhone 15'] } },
    { name: 'Android', use: { ...devices['Pixel 7'] } },
  ],
})
