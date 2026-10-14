import { expect, test } from '@playwright/test'

// このサイトが頼るブラウザの機能が、配信先で使えることを確かめる。
// ローカルのほか、デプロイのたびに本番の GitHub Pages に対しても流す（docs/deployment.md）

const probeKey = 'hihoukan-calc:e2e-probe'

test('安全な接続（HTTPS）として扱われる。クリップボードの前提', async ({ page }) => {
  await page.goto('./')
  expect(await page.evaluate(() => window.isSecureContext)).toBe(true)
})

test('localStorage に書いた値が、リロードしても開き直しても残る', async ({ page, context }) => {
  await page.goto('./')
  const value = `probe-${Date.now()}`
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [probeKey, value] as const)

  await page.reload()
  expect(await page.evaluate((k) => localStorage.getItem(k), probeKey)).toBe(value)

  // タブを閉じて開き直したときと同じ（同じブラウザの別タブ）
  await page.close()
  const reopened = await context.newPage()
  await reopened.goto('./')
  expect(await reopened.evaluate((k) => localStorage.getItem(k), probeKey)).toBe(value)
  await reopened.evaluate((k) => localStorage.removeItem(k), probeKey)
})

test('ボタンを押したときにクリップボードへ書き込める', async ({ page, context, browserName }) => {
  // 読み取りの確認に使う。書き込み自体はボタン操作だけで許可される
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await page.goto('./')
  await page.evaluate(() => {
    const button = document.createElement('button')
    button.id = 'probe-copy'
    button.textContent = 'copy'
    button.addEventListener('click', () => {
      navigator.clipboard.writeText('売上報告\n21:00時点').then(
        () => (button.dataset.result = 'ok'),
        (e: unknown) => (button.dataset.result = String(e)),
      )
    })
    document.body.append(button)
  })

  await page.locator('#probe-copy').click()
  await expect(page.locator('#probe-copy')).toHaveAttribute('data-result', 'ok')
  if (browserName === 'chromium') {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('売上報告\n21:00時点')
  }
})
