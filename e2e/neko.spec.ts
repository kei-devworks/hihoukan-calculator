import { expect, test, type Page } from '@playwright/test'

const morning = new Date('2026-10-15T10:00:00+09:00')

async function open(page: Page, at: Date = morning) {
  await page.clock.setFixedTime(at)
  await page.goto('neko/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ネコ・グリコ売上カウンター')
}

/** 「弓道 ステッカー 開店時の在庫」のような名前の欄に数字を入れる */
const field = (page: Page, name: string) => page.getByLabel(name, { exact: true })
const result = (page: Page, itemId: string) => page.locator(`[data-item="${itemId}"] .stock-result`)
const summary = (page: Page, sectionId: string) => page.locator(`#results [data-section="${sectionId}"] .stock-summary-line b`)

async function fillDay(page: Page) {
  // 開店時の在庫
  await field(page, '弓道 ステッカー 開店時の在庫').fill('20')
  await field(page, '弓道 絵馬 開店時の在庫').fill('15')
  await field(page, '手裏剣 手形 開店時の在庫').fill('8')
  // 途中で足した分
  await field(page, '弓道 ステッカー 途中で追加した数').fill('10')
  // 閉店時の残数
  await field(page, '弓道 ステッカー 残数').fill('12')
  await field(page, '弓道 絵馬 残数').fill('9')
  await field(page, '手裏剣 手形 残数').fill('5')
}

test('在庫と残数から、弓道と手裏剣の売上を分けて出す', async ({ page }) => {
  await open(page)
  await fillDay(page)

  await expect(result(page, 'kyudo-sticker')).toHaveText('売れた 18個 → ￥18,000-')
  await expect(result(page, 'kyudo-ema')).toHaveText('売れた 6個 → ￥3,000-')
  await expect(result(page, 'shuriken-tegata')).toHaveText('売れた 3個 → ￥1,500-')

  await expect(summary(page, 'kyudo')).toHaveText('￥21,000-')
  await expect(summary(page, 'shuriken')).toHaveText('￥1,500-')
  await expect(page.locator('#results [data-section="kyudo"] .stock-breakdown')).toHaveText('ステッカー 18個・絵馬 6個')
  await expect(page.locator('.stock-grand')).toHaveText('合計（弓道＋手裏剣）￥22,500-')
})

test('残数を入れるまでは、その時点の在庫を出す', async ({ page }) => {
  await open(page)
  await field(page, '手裏剣 絵馬 開店時の在庫').fill('12')
  await field(page, '手裏剣 絵馬 途中で追加した数').fill('6')
  await expect(result(page, 'shuriken-ema')).toHaveText('在庫 18個（残数を入れると計算します）')
  await expect(page.locator('[data-section="shuriken"] .stock-note')).toContainText('入れかけ 1品目')
})

test('リロードしても、タブを開き直しても入れた数が残る', async ({ page, context }) => {
  await open(page)
  await fillDay(page)
  await expect(page.getByRole('status')).toHaveText('この端末に保存済み（最終更新 10:00）')

  await page.reload()
  await expect(field(page, '弓道 ステッカー 途中で追加した数')).toHaveValue('10')
  await expect(summary(page, 'kyudo')).toHaveText('￥21,000-')

  await page.close()
  const reopened = await context.newPage()
  await open(reopened)
  await expect(field(reopened, '手裏剣 手形 残数')).toHaveValue('5')
  await expect(summary(reopened, 'shuriken')).toHaveText('￥1,500-')
})

test('残数が在庫より多いと知らせ、売上に入れない', async ({ page }) => {
  await open(page)
  await field(page, '弓道 手形 開店時の在庫').fill('5')
  await field(page, '弓道 手形 残数').fill('7')
  await expect(result(page, 'kyudo-tegata')).toHaveText('残数が在庫（5個）より多くなっています')
  await expect(summary(page, 'kyudo')).toHaveText('￥0-')
})

test('次の日に開くと知らせが出て、残数を今日の開店時の在庫に移せる', async ({ page }) => {
  await open(page, new Date('2026-10-14T10:00:00+09:00'))
  await fillDay(page)

  await page.clock.setFixedTime(new Date('2026-10-15T09:30:00+09:00'))
  await page.reload()
  const notice = page.getByRole('alert')
  await expect(notice).toContainText('10/14 10:00 から入れた数字が残っています')

  await notice.getByRole('button', { name: '残数を今日の開店時の在庫にする' }).click()
  await notice.getByRole('button', { name: 'もう一度押すと移す' }).click()
  await expect(notice).toBeHidden()
  await expect(field(page, '弓道 ステッカー 開店時の在庫')).toHaveValue('12')
  await expect(field(page, '弓道 ステッカー 途中で追加した数')).toHaveValue('')
  await expect(field(page, '弓道 ステッカー 残数')).toHaveValue('')
  await expect(summary(page, 'kyudo')).toHaveText('￥0-')
})

test('リセットは2回押したときだけ全部消え、リロード後も空のまま', async ({ page }) => {
  await open(page)
  await fillDay(page)
  await page.getByRole('button', { name: 'リセット' }).click()
  await expect(summary(page, 'kyudo')).toHaveText('￥21,000-')
  await page.getByRole('button', { name: 'もう一度押すと全部消す' }).click()
  await expect(field(page, '弓道 ステッカー 開店時の在庫')).toHaveValue('')

  await page.reload()
  await expect(field(page, '弓道 ステッカー 開店時の在庫')).toHaveValue('')
  await expect(page.locator('.stock-grand')).toHaveText('合計（弓道＋手裏剣）￥0-')
})

test('ポータルから開けて、一覧に戻れる', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: /ネコ・グリコ売上カウンター/ }).click()
  await expect(page).toHaveURL(/\/hihoukan-calculator\/neko\/$/)
  await page.getByRole('link', { name: '‹ 一覧' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('秘宝館 計算機')
})

test('スマホの幅で横にはみ出さない', async ({ page }) => {
  await open(page)
  await fillDay(page)
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
