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

  await page.getByRole('tab', { name: '品目' }).click()
  await page.getByLabel('串①').fill('1200')
  await expect(page.locator('[data-item="skewer1"] .nm')).toHaveText('1,200円')
  await expect(total(page)).toHaveText('￥2,400-')
  await expect(report(page)).toContainText('1,200×2')

  await page.reload()
  await expect(total(page)).toHaveText('￥2,400-')
  await page.getByRole('tab', { name: '品目' }).click()
  await expect(page.getByRole('heading', { name: '品目と単価（単価 1件 変更あり）' })).toBeVisible()
  await page.getByRole('button', { name: '単価をすべて既定に戻す' }).click()
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

test('押すと画面の下に今のオーダーが出て、［完了］で閉じると前のオーダーから出し直せる', async ({ page }) => {
  await open(page)
  await tap(page, '1,000円を1つ増やす', 2)
  await tap(page, 'ビールを1つ増やす')
  const panel = page.getByRole('region', { name: '今のオーダー' })
  await expect(panel).toBeVisible()
  await expect(panel.locator('.order-sum')).toHaveText('今のオーダー 20:50〜3点￥2,500')
  await expect(panel.locator('[data-item="skewer1"] .order-change')).toHaveText('0個 ＋2 → 2個')
  await expect(panel.locator('[data-item="beer"] .order-change')).toHaveText('0個 ＋1 → 1個')

  await panel.getByRole('button', { name: '完了' }).click()
  await expect(panel).toBeHidden()
  await page.getByRole('button', { name: '前のオーダー 20:50・3点 ￥2,500 ›' }).click()
  const previous = page.getByRole('region', { name: '前のオーダー' })
  await expect(previous.locator('.order-line')).toHaveText(['1,000円×2', 'ビール×1'])

  // 次のお客さんの分は新しいオーダーになり、元の数に前のオーダーの分が入る
  await tap(page, '1,000円を1つ増やす')
  await expect(panel.locator('[data-item="skewer1"] .order-change')).toHaveText('2個 ＋1 → 3個')
})

test('今のオーダーは、長押しで取り消し、画面の下の［元に戻す］で戻せる', async ({ page }) => {
  await open(page)
  await tap(page, 'ホタテを1つ増やす', 2)
  await holdPress(page, 'このオーダーを取り消す', '長押しでオーダーを取り消す')
  await expect(total(page)).toHaveText('￥0-')
  await expect(page.getByText('20:50 のオーダー（￥2,000）を取り消しました')).toBeVisible()
  await page.getByRole('button', { name: '元に戻す' }).click()
  await expect(total(page)).toHaveText('￥2,000-')
})

test('前のオーダーを［編集］で直すと合計が変わり、［元に戻す］で戻せる', async ({ page }) => {
  await open(page)
  await tap(page, '1,000円を1つ増やす', 2)
  await page.getByRole('button', { name: '完了' }).click()
  await page.getByRole('button', { name: /^前のオーダー/ }).click()
  await page.getByRole('region', { name: '前のオーダー' }).getByRole('button', { name: '編集' }).click()

  const editor = page.getByRole('dialog', { name: '20:50 のオーダーを編集' })
  await editor.getByRole('button', { name: '1,000円を1つ減らす' }).click()
  await editor.getByRole('button', { name: '＋ 品目を足す' }).click()
  await editor.getByRole('button', { name: '＋ ビール' }).click()
  await expect(editor.locator('.editor-summary')).toHaveText('変更前 ￥2,000 → 変更後 ￥1,500（−￥500）')
  await editor.getByRole('button', { name: '変更を保存' }).click()
  await expect(editor).toBeHidden()
  await expect(total(page)).toHaveText('￥1,500-')
  await expect(report(page)).toContainText('1,000×1')
  await expect(report(page)).toContainText('ビール×1')

  await page.getByRole('button', { name: '元に戻す' }).click()
  await expect(total(page)).toHaveText('￥2,000-')
})

test('記録の画面に、オーダーの数・1時間ごとの推移・オーダーの一覧が出て、そこから直せる', async ({ page }) => {
  await open(page, new Date('2026-10-15T18:10:00+09:00'))
  await tap(page, 'ホタテを1つ増やす')
  await page.clock.setFixedTime(new Date('2026-10-15T20:50:00+09:00'))
  await tap(page, '1,000円を1つ増やす', 2)

  await page.getByRole('tab', { name: '記録' }).click()
  await expect(page.locator('.log-summary')).toHaveText('2オーダー・最後の記録 20:50（いま）')
  await expect(page.locator('.log-hour-label')).toHaveText(['18時台', '19時台', '20時台'])
  await expect(page.locator('.log-hour.warn .log-note')).toHaveText('記録なし（押し忘れ？）')
  const latest = page.locator('.log-hour[open] .log-order').first()
  await expect(latest.locator('.log-items')).toHaveText('1,000円 ×2')
  await expect(latest.locator('.log-yen')).toHaveText('￥2,000')

  await page.getByRole('button', { name: '20:50 のオーダーを編集' }).click()
  const editor = page.getByRole('dialog', { name: '20:50 のオーダーを編集' })
  await editor.getByRole('button', { name: '1,000円を1つ減らす' }).click()
  await editor.getByRole('button', { name: '変更を保存' }).click()
  await expect(latest.locator('.log-meta')).toContainText('変更 1回')
  await expect(total(page)).toHaveText('￥2,000-')
})

test('会計で、受け取ったお札・硬貨を押すとお釣りが出て、次の ＋ は次のお客さんになる', async ({ page }) => {
  await open(page)
  await tap(page, '1,000円を1つ増やす', 2)
  await tap(page, 'ビールを1つ増やす')
  await page.getByRole('region', { name: '今のオーダー' }).getByRole('button', { name: '会計' }).click()
  const sheet = page.getByRole('dialog', { name: 'お会計（20:50 のオーダー）' })
  await expect(sheet.locator('.checkout-total')).toHaveText('￥2,500')
  await sheet.getByRole('button', { name: '1,000円を預かりに足す' }).click()
  await sheet.getByRole('button', { name: '1,000円を預かりに足す' }).click()
  await expect(sheet.locator('.checkout-change')).toHaveText('あと￥500')
  await sheet.getByRole('button', { name: '1,000円を預かりに足す' }).click()
  await expect(sheet.locator('.checkout-breakdown')).toHaveText('1,000×3')
  await expect(sheet.locator('.checkout-change')).toHaveText('お釣り￥500')

  await page.reload() // 預かりは保存される
  const panel = page.getByRole('region', { name: '今のオーダー' })
  await expect(panel.locator('.order-paid')).toHaveText('預かり ￥3,000 → お釣り ￥500。次の ＋ で次のお客さんになります')
  await tap(page, 'ホタテを1つ増やす')
  await expect(panel.locator('.order-sum')).toHaveText('今のオーダー 20:50〜1点￥1,000')
})

test('レジ精算で、ポケットと釣り銭準備金の枚数から売上のお金を出し、カウンターの合計と比べる', async ({ page }) => {
  await open(page)
  await countSample(page) // ￥12,900
  await page.getByRole('tab', { name: 'レジ精算' }).click()
  await page.getByLabel('売上のポケット 1万円札の枚数').fill('1')
  await page.getByLabel('売上のポケット 千円札の枚数').fill('3')
  await page.getByLabel('釣り銭準備金 100円玉 開店時の枚数').fill('30')
  await page.getByLabel('釣り銭準備金 100円玉 いまの枚数').fill('29')
  await expect(page.locator('.cash-calc .eq b')).toHaveText('￥12,900')
  await expect(page.locator('.cash-verdict[aria-live]')).toHaveText('ぴったり合っています。')

  await page.reload()
  await page.getByRole('tab', { name: 'レジ精算' }).click()
  await expect(page.getByLabel('売上のポケット 千円札の枚数')).toHaveValue('3')
  await page.getByLabel('売上のポケット 千円札の枚数').fill('4')
  await expect(page.locator('.cash-verdict[aria-live]')).toHaveText(
    'お金のほうが ￥1,000 多い。押し忘れがないか記録を見てください（1,000円・ホタテ 1つ分と同じ額）。',
  )
})

test('最後に押してから3分たつと、今のオーダーは自動で閉じる', async ({ page }) => {
  await page.clock.install({ time: evening })
  await page.goto('takumi/')
  await tap(page, 'ホタテを1つ増やす')
  await expect(page.getByRole('region', { name: '今のオーダー' })).toBeVisible()
  await page.clock.runFor(3 * 60_000 + 1000)
  await expect(page.getByRole('region', { name: '今のオーダー' })).toBeHidden()
  await expect(page.getByRole('button', { name: /^前のオーダー 20:50/ })).toBeVisible()
})

test('「品目」で見出しに品目を足すと、数えられて報告文にも入り、リロード後も残る', async ({ page }) => {
  await open(page)
  await page.getByRole('tab', { name: '品目' }).click()
  await page.getByRole('button', { name: '＋ ◾️ソフトに品目を足す' }).click()
  await page.getByLabel('◾️ソフトに足す品目の名前').fill('チョコトッピング')
  await page.getByLabel('◾️ソフトに足す品目の単価').fill('100')
  await page.locator('.items-section[data-section="soft"]').getByRole('button', { name: '足す', exact: true }).click()
  await expect(page.getByRole('heading', { name: '品目と単価（1品目 追加）' })).toBeVisible()

  await page.getByRole('tab', { name: '注文' }).click()
  await tap(page, 'バニラを1つ増やす')
  await tap(page, 'チョコトッピングを1つ増やす', 2)
  await expect(report(page)).toContainText('バニラ×1\nチョコトッピング×2\n小計￥1,000-')
  await expect(total(page)).toHaveText('￥1,000-')

  await page.reload()
  await expect(page.locator('[data-section="soft"] .row .nm').last()).toHaveText('チョコトッピング')
  await expect(total(page)).toHaveText('￥1,000-')
})

test('ポータルから開けて、一覧に戻れる', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: /タクミ売上カウンター/ }).click()
  await expect(page).toHaveURL(/\/hihoukan-calculator\/takumi\/$/)
  await page.getByRole('link', { name: '‹ 一覧' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('秘宝館 計算機')
})

test('見出しの下のボタンで「注文」と「品目」を切り替える。開いたときは「注文」', async ({ page }) => {
  await open(page)
  const countTab = page.getByRole('tab', { name: '注文' })
  await expect(countTab).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('button', { name: 'ホタテを1つ増やす' })).toBeVisible()
  await expect(page.getByLabel('串①')).toBeHidden()

  // 選んだボタンは見た目が変わる（CSS が当たっていないと、どのボタンも同じ灰色のままになる）
  const background = (name: string) => page.getByRole('tab', { name }).evaluate((e) => getComputedStyle(e).backgroundColor)
  const selectedLook = await background('注文')
  expect(await background('品目')).not.toBe(selectedLook)

  await page.getByRole('tab', { name: '品目' }).click()
  await expect(page.getByLabel('串①')).toBeVisible()
  await expect(page.getByRole('button', { name: 'ホタテを1つ増やす' })).toBeHidden()
  expect(await background('品目')).toBe(selectedLook)
  expect(await background('注文')).not.toBe(selectedLook)

  await page.reload()
  await expect(countTab).toHaveAttribute('aria-selected', 'true')
})

test('スマホの幅で横にはみ出さない', async ({ page }) => {
  await open(page)
  await countSample(page)
  for (const tab of ['注文', '記録', 'レジ精算', '品目']) {
    await page.getByRole('tab', { name: tab }).click()
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    expect(overflow, tab).toBeLessThanOrEqual(0)
  }
})

/** コピーした文字列を受け取れるようにする（どのブラウザでも、クリップボードの権限なしで中身を確かめる） */
async function catchCopies(page: Page) {
  await page.addInitScript(() => {
    const copied: string[] = []
    ;(window as unknown as { copied: string[] }).copied = copied
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: async (text: string) => void copied.push(text) },
    })
  })
}

test('2台で引き継ぐ: 前の人のリンクを次の人の端末で開き、ゼロから引き継ぐと報告文が同じになる', async ({ page, browser }) => {
  // 前の人の端末
  await catchCopies(page)
  await open(page)
  await countSample(page)
  await page.getByRole('button', { name: '引き継ぎ', exact: true }).click()
  await page.getByRole('button', { name: /^次の人に渡す/ }).click()
  await expect(page.locator('.send-info b')).toHaveText('20:50時点・10点・￥12,900')
  await expect(page.getByRole('img', { name: '引き継ぎの QR コード' })).toBeVisible()
  await page.getByRole('button', { name: 'リンクをコピー' }).click()
  await expect(page.getByRole('button', { name: 'コピーしました' })).toBeVisible()
  const link = await page.evaluate(() => (window as unknown as { copied: string[] }).copied.at(-1)!)
  expect(link).toMatch(/\/hihoukan-calculator\/takumi\/#hikitsugi=[A-Za-z0-9_-]+$/)

  // 次の人の端末（保存場所は別）
  const next = await (await browser.newContext()).newPage()
  await next.clock.setFixedTime(new Date('2026-10-15T20:55:00+09:00'))
  await next.goto(link)
  const dialog = next.getByRole('dialog', { name: '前の人から受け取る' })
  await expect(dialog).toBeVisible()
  await expect(next).toHaveURL(/\/takumi\/$/)
  await expect(dialog.getByText('前の人の 20:50時点（5分前）の数を読み取りました（6品目）。')).toBeVisible()
  await expect(dialog.getByLabel('ホタテ 前の人の数')).toHaveValue('2')
  // 種類は、はじめからゼロから引き継ぐ
  await expect(dialog.getByRole('radio', { name: 'ゼロから引き継ぐ' })).toBeChecked()
  await expect(dialog.getByText('前の人の数の合計は、前の人の合計 ￥12,900 と合っています。')).toBeVisible()
  await dialog.getByRole('button', { name: '引き継ぐ（10点 ￥12,900）' }).click()
  await expect(dialog).toBeHidden()

  await expect(report(next)).toHaveText(expectedReport)
  await expect(next.locator('.notice-bar-text')).toHaveText('前の人の数を引き継ぎました（10点 ￥12,900）')
  await next.reload()
  await expect(report(next)).toHaveText(expectedReport)
  await next.getByRole('tab', { name: '記録' }).click()
  await expect(next.locator('.log-handover')).toContainText('前の人の 20:50時点の数')
  await next.context().close()
})

test('休憩から戻ったら、報告文を貼って足りない分だけ足す。はみ出さない', async ({ page }) => {
  await open(page)
  await tap(page, '1,000円を1つ増やす')
  await tap(page, 'ホタテを1つ増やす', 3)
  await page.getByRole('button', { name: '引き継ぎ', exact: true }).click()
  await page.getByRole('button', { name: /^前の人から受け取る/ }).click()
  const dialog = page.getByRole('dialog', { name: '前の人から受け取る' })
  await dialog.getByRole('radio', { name: '休憩から戻った' }).click()
  await dialog.getByRole('tab', { name: '報告文を貼る' }).click()
  await dialog.getByLabel('前の人の報告文').fill(expectedReport)

  await expect(dialog.getByText('21:00時点の報告文を読み取りました（6品目）。')).toBeVisible()
  await expect(dialog.locator('[data-item="skewer1"] .handover-change')).toHaveText('この端末 1個 ＋2 → 3個')
  await expect(dialog.locator('[data-item="hotate"] .handover-change')).toHaveText('この端末 3個（前の人より多いので減らしません）')
  // スマホの幅で横にはみ出さない
  const overflow = await page.evaluate(() => {
    const d = document.querySelector('dialog.handover')!
    return Math.max(d.scrollWidth - d.clientWidth, document.documentElement.scrollWidth - window.innerWidth)
  })
  expect(overflow).toBeLessThanOrEqual(0)

  await dialog.getByRole('button', { name: '引き継ぐ（＋7点 ￥9,900）' }).click()
  await expect(total(page)).toHaveText('￥13,900-')
  await expect(count(page, 'hotate')).toHaveText('3')
})
