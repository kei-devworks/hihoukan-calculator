import { expect, test } from '@playwright/test'

test('ポータルが GitHub Pages と同じサブパスで表示される', async ({ page }) => {
  await page.goto('./')
  await expect(page).toHaveTitle('秘宝館 計算機')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('秘宝館 計算機')
})
