import { expect, test } from '@playwright/test'
import { pages } from '../src/pages/registry'

/** ポータルと、ポータルに載っているすべてのページ */
const allPaths = ['./', ...pages.map((p) => `${p.path}/`)]

test('ポータルが GitHub Pages と同じサブパスで表示される', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('秘宝館 計算機')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('秘宝館 計算機')
})

test('どのページからも、タブとホーム画面のアイコンが読める', async ({ page }) => {
  for (const path of allPaths) {
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

test('［共有］で入口の QR コードとリンクが出て、リンクをコピーできる', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./')
  const url = new URL('./', page.url()).href

  await page.getByRole('button', { name: 'このサイトを共有' }).click()
  const dialog = page.getByRole('dialog', { name: 'このサイトを共有' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('img', { name: 'このサイトの入口の QR コード' })).toBeVisible()
  await expect(dialog.getByText(url, { exact: true })).toBeVisible()

  await dialog.getByRole('button', { name: 'リンクをコピー' }).click()
  await expect(dialog.getByRole('button', { name: 'コピーしました' })).toBeVisible()
  if (browserName === 'chromium') expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(url)

  await dialog.getByRole('button', { name: '閉じる' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.locator('dialog')).toHaveCount(0)
})

test('［共有］のダイアログを開いても、スマホの幅で横にはみ出さない', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('button', { name: 'このサイトを共有' }).click()
  await expect(page.getByRole('img', { name: 'このサイトの入口の QR コード' })).toBeVisible()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})

test('どのページも検索に出さない（noindex, nofollow）', async ({ page }) => {
  for (const path of allPaths) {
    await page.goto(path)
    await expect(page.locator('meta[name="robots"]'), path).toHaveAttribute('content', 'noindex, nofollow')
  }
})
