import { expect, test, type Page } from '@playwright/test'

const firstNight = new Date('2026-10-14T23:10:00+09:00')
const nextNight = new Date('2026-10-15T23:05:00+09:00')

async function open(page: Page, at: Date) {
  await page.clock.setFixedTime(at)
  await page.goto('kinmu/')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('勤務時間報告')
}

const report = (page: Page) => page.locator('#report')

async function addPattern(page: Page, amount: string, from: string, to: string) {
  const editor = page.locator('.pattern-editor')
  if (await editor.isHidden()) await page.getByRole('button', { name: '＋ パターンを追加' }).click()
  await page.getByLabel('交通費（往復）の金額').fill(amount)
  await page.getByLabel('駅（行き）').fill(from)
  await page.getByLabel('駅（帰り）').fill(to)
  await editor.getByRole('button', { name: '保存' }).click()
}

const example = `勤務時間報告
10月14日(水曜日)
勤務時間\u300016:00 〜23:00
休憩時間\u30000分
交通費\u3000（往復）500円
\u3000\u3000園田駅〜なんば駅`

test('初めての報告: 交通費を登録してコピーする（受領済みの行はない）', async ({ page, context, browserName }) => {
  if (browserName === 'chromium') await context.grantPermissions(['clipboard-read', 'clipboard-write'])
  await open(page, firstNight)
  await addPattern(page, '500', '園田', 'なんば')
  await expect(report(page)).toHaveText(example)

  await page.getByRole('button', { name: 'コピーして報告する' }).click()
  await expect(page.getByRole('button', { name: 'コピーしました' })).toBeVisible()
  await expect(page.locator('#after-copy')).toContainText('次の報告では「10月14日分受領済み」が入ります')
  if (browserName === 'chromium') {
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(example)
  }
})

test('次の日: 前回の勤務日が受領済みに、前回の勤務時間と交通費が最初から入っている', async ({ page }) => {
  await open(page, firstNight)
  await addPattern(page, '500', '園田', 'なんば')
  await page.getByLabel('開始の時').selectOption('17')
  await page.getByRole('button', { name: '30分' }).click()
  await page.getByRole('button', { name: 'コピーして報告する' }).click()
  await expect(page.locator('#after-copy')).not.toBeEmpty()

  await page.clock.setFixedTime(nextNight)
  await page.reload()
  await expect(report(page)).toHaveText(`勤務時間報告
10月15日(木曜日)
勤務時間\u300017:00 〜23:00
休憩時間\u300030分
交通費\u3000（往復）500円
\u3000\u3000園田駅〜なんば駅
10月14日分受領済み`)
  await expect(page.getByLabel('受領済みの勤務日（前回の勤務日）')).toHaveValue('2026-10-14')
})

test('月払いにすると受領済みの行が消え、リロードしても月払いのまま', async ({ page }) => {
  await open(page, firstNight)
  // 押した直後にページを離れても記録されている（コピーの完了を待たずに記録する）
  await page.getByRole('button', { name: 'コピーして報告する' }).click()
  await page.clock.setFixedTime(nextNight)
  await page.reload()
  await expect(report(page)).toContainText('10月14日分受領済み')

  await page.getByText('月払い', { exact: true }).click()
  await expect(report(page)).not.toContainText('受領済み')
  await page.reload()
  await expect(report(page)).not.toContainText('受領済み')

  await page.getByText('日払い', { exact: true }).click()
  await expect(report(page)).toContainText('10月14日分受領済み')
})

test('受領済みの勤務日は変えられ、「消す」で行がなくなる', async ({ page }) => {
  await open(page, firstNight)
  await page.getByRole('button', { name: 'コピーして報告する' }).click()
  await page.clock.setFixedTime(nextNight)
  await page.reload()

  await page.getByLabel('受領済みの勤務日（前回の勤務日）').fill('2026-10-12')
  await expect(report(page)).toContainText('10月12日分受領済み')
  await page.getByRole('button', { name: '消す' }).click()
  await expect(report(page)).not.toContainText('受領済み')
})

test('遅れて報告するときは、勤務日を前の日に戻せる', async ({ page }) => {
  await open(page, new Date('2026-10-16T12:00:00+09:00'))
  await expect(page.locator('#work-date-text')).toHaveText('10月16日(金曜日)')
  await page.getByRole('button', { name: '‹ 前の日' }).click()
  await expect(report(page)).toContainText('10月15日(木曜日)')
  await page.getByLabel('勤務日', { exact: true }).fill('2026-10-10')
  await expect(report(page)).toContainText('10月10日(土曜日)')
  await page.getByRole('button', { name: '今日' }).click()
  await expect(report(page)).toContainText('10月16日(金曜日)')
})

test('深夜 0 時を過ぎてから開いても、勤務日は前の日になる', async ({ page }) => {
  await open(page, new Date('2026-10-15T00:40:00+09:00'))
  await expect(report(page)).toContainText('10月14日(水曜日)')
})

test('交通費のパターンを足してタップで切り替えられ、リロード後も残る', async ({ page }) => {
  await open(page, firstNight)
  await addPattern(page, '500', '園田', 'なんば')
  await addPattern(page, '1200', '園田駅', '梅田駅')
  await expect(report(page)).toContainText('（往復）1,200円\n\u3000\u3000園田駅〜梅田駅')

  await page.getByText('なんば駅').click()
  await expect(report(page)).toContainText('（往復）500円')
  await page.reload()
  await expect(report(page)).toContainText('（往復）500円')
  await expect(page.getByRole('radio')).toHaveCount(3 + 2) // パターン2つ + なし、給料の受け取り2つ
})

test('勤務時間を選ぶと実働を出し、休憩が長すぎると知らせる', async ({ page }) => {
  await open(page, firstNight)
  await page.getByLabel('開始の時').selectOption('10')
  await page.getByLabel('開始の分').selectOption('30')
  await page.getByLabel('終了の時').selectOption('18')
  await page.getByRole('button', { name: '60分' }).click()
  await expect(report(page)).toContainText('勤務時間\u300010:30 〜18:00\n休憩時間\u300060分')
  await expect(page.locator('#working')).toHaveText('実働 6時間30分')

  await page.getByLabel('休憩（分）').fill('600')
  await expect(page.locator('#working')).toHaveText('休憩が勤務時間より長くなっています')
})

test('ポータルから開けて、一覧に戻れる', async ({ page }) => {
  await page.goto('./')
  await page.getByRole('link', { name: /勤務時間報告/ }).click()
  await expect(page).toHaveURL(/\/hihoukan-calculator\/kinmu\/$/)
  await page.getByRole('link', { name: '‹ 一覧' }).click()
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('秘宝館 計算機')
})

test('スマホの幅で横にはみ出さない', async ({ page }) => {
  await open(page, firstNight)
  await addPattern(page, '1200', '園田', '大阪難波')
  await page.getByRole('button', { name: '＋ パターンを追加' }).click()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
