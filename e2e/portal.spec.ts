import { expect, test } from '@playwright/test'

test('ポータルが GitHub Pages と同じサブパスで表示される', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('秘宝館 計算機')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('秘宝館 計算機')
})

test('どのページからも、タブとホーム画面のアイコンが読める', async ({ page }) => {
  for (const path of ['./', 'takumi/', 'neko/', 'kinmu/']) {
    await page.goto(path)
    const hrefs = await page
      .locator('link[rel="icon"], link[rel="apple-touch-icon"]')
      .evaluateAll((links) => links.map((link) => (link as HTMLLinkElement).href))
    expect(hrefs, path).toHaveLength(3)
    for (const href of hrefs) {
      const res = await page.request.get(href)
      expect(res.status(), href).toBe(200)
    }
  }
})
