import { expect, test, type Page } from '@playwright/test'

// 端末の時計を固定して、報告時刻を決まった値にする（20:50 → 21:00時点）
const evening = new Date('2026-10-15T20:50:00+09:00')

async function open(page: Page, at: Date = evening) {
  await page.clock.setFixedTime(at)
  await page.goto('takumi/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('タクミ売上カウンター')
}

async function tap(page: Page, name: string, times = 1) {
  const button = page.getByRole('button', { name, exact: true })
  for (let i = 0; i < times; i++) await button.click()
}

/** 長押しのボタン: タップで構え、1秒より長く押し続ける */
async function holdPress(page: Page, label: string, armedLabel: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.getByRole('button', { name: armedLabel, exact: true }).hover()
  await page.mouse.down()
  await page.waitForTimeout(1300)
  await page.mouse.up()
}

const count = (page: Page, itemId: string) => page.locator(`[data-item="${itemId}"] .n`)
const total = (page: Page) => page.locator('#total')
const report = (page: Page) => page.locator('#report')

const expectedReport = `売上報告
21:00時点

◾️肉
1,000×3
5,000×1
ホタテ×2
ビール×1
小計￥10,500-

◾️ソフト
バニラ×2
抹茶×1
小計￥2,400-

合計￥12,900-`

async function countSample(page: Page) {
  await tap(page, '1,000円を1つ増やす', 3)
  await tap(page, '5,000円を1つ増やす')
  await tap(page, 'ホタテを1つ増やす', 2)
  await tap(page, 'ビールを1つ増やす')
  await tap(page, 'バニラを1つ増やす', 2)
  await tap(page, '抹茶を1つ増やす')
}

test('数えた売上から定型文を作ってコピーできる', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await open(page)
  await countSample(page)

  await expect(total(page)).toHaveText('￥12,900-')
  await expect(page.locator('[data-section="meat"] .sub')).toContainText('￥10,500-')
  await expect(report(page)).toHaveText(expectedReport)

  await page.getByRole('button', { name: 'コピー' }).click()
  await expect(page.getByRole('button', { name: 'コピーしました' })).toBeVisible()
  if (browserName === 'chromium') {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(expectedReport)
  }
})

test('リロードしても、タブを開き直しても数字が残る', async ({ page, context }) => {
  await open(page)
  await countSample(page)
  await expect(page.getByRole('status')).toHaveText('この端末に保存済み（最終更新 20:50）')

  await page.reload()
  await expect(count(page, 'skewer1')).toHaveText('3')
  await expect(total(page)).toHaveText('￥12,900-')
  await expect(report(page)).toHaveText(expectedReport)

  await page.close()
  const reopened = await context.newPage()
  await open(reopened)
  await expect(count(reopened, 'hotate')).toHaveText('2')
  await expect(total(reopened)).toHaveText('￥12,900-')
})

test('− は 0 より下がらない', async ({ page }) => {
  await open(page)
  await tap(page, 'ホタテを1つ減らす', 2)
  await expect(count(page, 'hotate')).toHaveText('0')
  await expect(total(page)).toHaveText('￥0-')
})

test('リセットは、タップしただけでは 0 にならず、長押しで全部 0 になり、リロード後も 0 のまま', async ({ page }) => {
  await open(page)
  await countSample(page)

  await page.getByRole('button', { name: 'リセット' }).click()
  await page.getByRole('button', { name: '長押しで全部 0 にする' }).click()
  await expect(total(page)).toHaveText('￥12,900-')
  await page.mouse.move(0, 0)
  await page.waitForTimeout(4200) // 構えてから4秒で元に戻る
  await holdPress(page, 'リセット', '長押しで全部 0 にする')
  await expect(total(page)).toHaveText('￥0-')

  await page.reload()
  await expect(total(page)).toHaveText('￥0-')
})

test('リセットのあと、画面の下の［元に戻す］で戻せる', async ({ page }) => {
  await open(page)
  await countSample(page)
  await holdPress(page, 'リセット', '長押しで全部 0 にする')
  await expect(total(page)).toHaveText('￥0-')
  await expect(page.getByText('全部 0 にしました')).toBeVisible()
  await page.getByRole('button', { name: '元に戻す' }).click()
  await expect(total(page)).toHaveText('￥12,900-')
  await page.reload()
  await expect(total(page)).toHaveText('￥12,900-')
})

test('リセットをタップしてから4秒たつと、押し直しになる', async ({ page }) => {
  await page.clock.install({ time: evening })
  await page.goto('takumi/')
  await tap(page, 'ホタテを1つ増やす')
  await page.getByRole('button', { name: 'リセット' }).click()
  await expect(page.getByRole('button', { name: '長押しで全部 0 にする' })).toBeVisible()
  await page.clock.runFor(4500)
  await expect(page.getByRole('button', { name: 'リセット' })).toBeVisible()
  await expect(total(page)).toHaveText('￥1,000-')
})

test('単価を変えると名前と合計に反映し、リロード後も残る。既定に戻せる', async ({ page }) => {
  await open(page)
  await tap(page, '1,000円を1つ増やす', 2)

  await page.getByText('単価設定').click()
  await page.getByLabel('串①').fill('1200')
  await expect(page.locator('[data-item="skewer1"] .nm')).toHaveText('1,200円')
  await expect(total(page)).toHaveText('￥2,400-')
  await expect(report(page)).toContainText('1,200×2')

  await page.reload()
  await expect(total(page)).toHaveText('￥2,400-')
  await page.getByText('単価設定（1件 変更あり）').click()
  await page.getByRole('button', { name: 'すべて既定に戻す' }).click()
  await expect(total(page)).toHaveText('￥2,000-')
})

test('前の営業日の数字が残っていたら知らせ、0 に戻して今日を始められる', async ({ page }) => {
  await open(page, new Date('2026-10-14T18:00:00+09:00'))
  await tap(page, 'ビールを1つ増やす', 4)

  // 次の日の昼に開く
  await page.clock.setFixedTime(new Date('2026-10-15T12:10:00+09:00'))
  await page.reload()
  const notice = page.getByRole('alert')
  await expect(notice).toContainText('10/14 18:00 から数えた数字が残っています')
  await expect(total(page)).toHaveText('￥2,000-')

  await holdPress(page, '0 に戻して今日を始める', '長押しで全部 0 にする')
  await expect(notice).toBeHidden()
  await expect(total(page)).toHaveText('￥0-')
})

test('同じ端末の別のタブで数えた分も、表示に反映される', async ({ page, context }) => {
  await open(page)
  const other = await context.newPage()
  await open(other)

  await tap(other, '抹茶を1つ増やす', 2)
  await expect(count(page, 'matcha')).toHaveText('2')
  await expect(total(page)).toHaveText('￥1,600-')
})

test('ポータルから開けて、一覧に戻れる', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: /タクミ売上カウンター/ }).click()
  await expect(page).toHaveURL(/\/hihoukan-calculator\/takumi\/$/)
  await page.getByRole('link', { name: '‹ 一覧' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('秘宝館 計算機')
})

test('スマホの幅で横にはみ出さない', async ({ page }) => {
  await open(page)
  await page.getByText('単価設定').click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
