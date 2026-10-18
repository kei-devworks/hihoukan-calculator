import { expect, test, type Page } from '@playwright/test'

const morning = new Date('2026-10-15T10:00:00+09:00')

async function open(page: Page, at: Date = morning) {
  await page.clock.setFixedTime(at)
  await page.goto('neko/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('ネコ・グリコ売上カウンター')
}

/** 「弓道 ステッカー 開店時の在庫」のような名前の欄 */
const field = (page: Page, name: string) => page.getByLabel(name, { exact: true })

/** 欄の名前の頭（弓道・手裏剣）のタブに切り替えてから、数字を入れる */
async function fill(page: Page, name: string, value: string) {
  await page.getByRole('tab', { name: new RegExp(`^${name.split(' ')[0]}`) }).click()
  await field(page, name).fill(value)
}

/** 長押しのボタン: タップで構え、1秒より長く押し続ける */
async function holdPress(page: Page, label: string, armedLabel: string) {
  await page.getByRole('button', { name: label, exact: true }).click()
  await page.getByRole('button', { name: armedLabel, exact: true }).hover()
  await page.mouse.down()
  await page.waitForTimeout(1300)
  await page.mouse.up()
}
const result = (page: Page, itemId: string) => page.locator(`.stock-result[data-item="${itemId}"]`)
const summary = (page: Page, sectionId: string) => page.locator(`#results [data-section="${sectionId}"] .stock-summary-line b`)

async function fillDay(page: Page) {
  // 開店時の在庫
  await fill(page, '弓道 ステッカー 開店時の在庫', '20')
  await fill(page, '弓道 絵馬 開店時の在庫', '15')
  await fill(page, '手裏剣 手形 開店時の在庫', '8')
  // 途中で足した分
  await fill(page, '弓道 ステッカー 途中で追加した数', '10')
  // 閉店時の残数
  await fill(page, '弓道 ステッカー 残数', '12')
  await fill(page, '弓道 絵馬 残数', '9')
  await fill(page, '手裏剣 手形 残数', '5')
}

test('在庫と残数から、弓道と手裏剣の売上を分けて出す', async ({ page }) => {
  await open(page)
  await fillDay(page)

  await expect(result(page, 'kyudo-sticker')).toHaveText('＝ 売れた 18個 → ￥18,000-')
  await expect(result(page, 'kyudo-ema')).toHaveText('＝ 売れた 6個 → ￥3,000-')
  await expect(result(page, 'shuriken-tegata')).toHaveText('＝ 売れた 3個 → ￥1,500-')

  await expect(summary(page, 'kyudo')).toHaveText('￥21,000-')
  await expect(summary(page, 'shuriken')).toHaveText('￥1,500-')
  await expect(page.locator('#results [data-section="kyudo"] .stock-breakdown')).toHaveText('ステッカー 18個・絵馬 6個')
  await expect(page.locator('.stock-grand')).toHaveText('合計（弓道＋手裏剣）￥22,500-')
})

test('残数を入れるまでは、その時点の在庫を出す', async ({ page }) => {
  await open(page)
  await fill(page, '手裏剣 絵馬 開店時の在庫', '12')
  await fill(page, '手裏剣 絵馬 途中で追加した数', '6')
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
  await fill(page, '弓道 手形 開店時の在庫', '5')
  await fill(page, '弓道 手形 残数', '7')
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

  await holdPress(page, '残数を今日の開店時の在庫にする', '長押しで残数を開店時に移す')
  await expect(notice).toBeHidden()
  await expect(field(page, '弓道 ステッカー 開店時の在庫')).toHaveValue('12')
  await expect(field(page, '弓道 ステッカー 途中で追加した数')).toHaveValue('')
  await expect(field(page, '弓道 ステッカー 残数')).toHaveValue('')
  await expect(summary(page, 'kyudo')).toHaveText('￥0-')
})

test('リセットは、タップしただけでは消えず、長押しで全部消え、リロード後も空のまま', async ({ page }) => {
  await open(page)
  await fillDay(page)
  await page.getByRole('button', { name: 'リセット' }).click()
  await expect(summary(page, 'kyudo')).toHaveText('￥21,000-')
  await page.mouse.move(0, 0)
  await page.waitForTimeout(4200)
  await holdPress(page, 'リセット', '長押しで全部消す')
  await expect(field(page, '弓道 ステッカー 開店時の在庫')).toHaveValue('')

  await page.reload()
  await expect(field(page, '弓道 ステッカー 開店時の在庫')).toHaveValue('')
  await expect(page.locator('.stock-grand')).toHaveText('合計（弓道＋手裏剣）￥0-')
})

test('弓道と手裏剣をタブで切り替え、それぞれレジ精算をして精算を完了でき、記録が残る', async ({ page }) => {
  await open(page)
  await fillDay(page) // 弓道 ￥21,000、手裏剣 ￥1,500
  await expect(page.getByRole('tab', { name: '弓道 ￥21,000' })).toBeVisible()
  await expect(page.getByRole('tab', { name: '手裏剣 ￥1,500' })).toBeVisible()
  // 選んだタブは見た目が変わる（CSS が当たっていないと、どのタブも同じ灰色のままになる）。fillDay は手裏剣のタブで終わる
  const background = (name: RegExp) => page.getByRole('tab', { name }).evaluate((e) => getComputedStyle(e).backgroundColor)
  const selectedLook = await background(/^手裏剣/)
  expect(await background(/^弓道/)).not.toBe(selectedLook)

  await fill(page, '弓道 売上のポケット 1万円札の枚数', '2')
  expect(await background(/^弓道/)).toBe(selectedLook)
  expect(await background(/^手裏剣/)).not.toBe(selectedLook)
  await fill(page, '弓道 売上のポケット 千円札の枚数', '1')
  await expect(page.locator('#panel-kyudo .cash-verdict[aria-live]')).toHaveText('ぴったり合っています。')
  await page.locator('#panel-kyudo').getByRole('button', { name: '精算を完了する（差 ￥0）' }).click()
  await expect(page.getByRole('tab', { name: '弓道 ￥21,000 ✓' })).toBeVisible()
  await expect(page.locator('#panel-kyudo .settle-row')).toHaveText(['1回目10:00差 ￥0在庫から ￥21,000・お金から ￥21,000'])
  await expect(page.locator('#panel-kyudo').getByRole('button', { name: '精算は完了しています' })).toBeDisabled()

  // 手裏剣は別に数える（弓道の枚数は入らない）
  await fill(page, '手裏剣 売上のポケット 千円札の枚数', '1')
  await expect(page.locator('#panel-shuriken .cash-verdict[aria-live]')).toHaveText(
    'お金のほうが ￥500 少ない。残数の数えまちがいや、お釣りのまちがいがないか確かめてください（絵馬・手形 1つ分と同じ額）。',
  )

  await page.reload()
  await expect(page.getByRole('tab', { name: '弓道 ￥21,000 ✓' })).toBeVisible()
  await expect(field(page, '弓道 売上のポケット 1万円札の枚数')).toHaveValue('2')
  await expect(page.locator('#panel-kyudo .settle-row')).toHaveCount(1)
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

test('入れた数を直すとき、欄の左のほうを押しても、カーソルは数字のいちばん右に来る', async ({ page }) => {
  await open(page)
  const sticker = field(page, '弓道 ステッカー 開店時の在庫')
  await sticker.fill('120')
  await page.locator('body').click({ position: { x: 5, y: 5 } })
  // 右寄せの数字の左の、空いたところを押す
  await sticker.click({ position: { x: 8, y: 10 } })
  await expect.poll(() => sticker.evaluate((el: HTMLInputElement) => [el.selectionStart, el.selectionEnd])).toEqual([3, 3])
  await page.keyboard.press('Backspace')
  await expect(sticker).toHaveValue('12')
})

test('残数の欄から「次へ」（Tab）で、下の品目の残数へ進む。欄は品目ごとに横に並んだまま', async ({ page }) => {
  await open(page)
  const sticker = field(page, '弓道 ステッカー 残数')
  await sticker.fill('12')
  await page.keyboard.press('Tab')
  await expect(field(page, '弓道 絵馬 残数')).toBeFocused()
  await page.keyboard.type('9')
  await page.keyboard.press('Tab')
  await expect(field(page, '弓道 手形 残数')).toBeFocused()
  await expect(field(page, '弓道 絵馬 残数')).toHaveValue('9')

  // 見た目は品目ごとに「開店時 ＋ 追加 − 残数」が横に並び、下の品目はその下
  const top = async (name: string) => (await field(page, name).boundingBox())!.y
  expect(await top('弓道 ステッカー 開店時の在庫')).toBe(await top('弓道 ステッカー 残数'))
  expect(await top('弓道 絵馬 残数')).toBeGreaterThan(await top('弓道 ステッカー 残数'))
  await expect(page.locator('#panel-kyudo .stock-op').first()).toHaveText('＋')
})
