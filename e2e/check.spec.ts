import { expect, test } from '@playwright/test'

// 実機での確認のページ（pages/check）。カメラの読み取りそのものは実機で確かめる（docs/deployment.md）

test('この端末でできることを並べ、確認用の QR コードを出す', async ({ page }) => {
  await page.goto('check/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('QR の読み取りの確認')
  await expect(page.locator('.check-facts')).toContainText('HTTPS')
  await expect(page.locator('.check-facts')).toContainText('保存場所の番号')
  await expect(page.getByRole('img', { name: 'この端末の確認用の QR コード' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'カメラで読み取る' })).toBeVisible()
})

test('リンクから開くと、QR を出した端末の番号と、この開き方の番号を結果に残し、URL からは消す', async ({ page }) => {
  await page.goto('check/#check=ABCD')
  await expect(page.locator('.check-results')).toContainText('QR を出した端末の番号 ABCD')
  expect(new URL(page.url()).hash).toBe('')
})
