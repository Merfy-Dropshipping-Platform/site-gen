/**
 * Спека 120, этап 5 на vanilla: режим «как тема» на стенде формы покупки.
 * Машинная проверка вычисленных стилей в настоящем Chromium: с ?look=vanilla
 * скругления и шрифт — из токенов vanilla (0px, Arsenal), главная кнопка —
 * из цветовой схемы 1 (фон rgb(58, 69, 48), текст rgb(255, 255, 255)).
 * Без параметра стенд прежний: палитра прототипа PM (9px, rgb(20, 20, 20)).
 * Падает на коде без режима «как тема» (задача 2): стили берутся из
 * runtime/extension-purchase.styles.ts, стенд включает токены theme.json.
 */
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';
import { chromium, type Browser } from 'playwright';

const ROOT = resolve(__dirname, '..', '..', '..');
const STAND = `file://${resolve(ROOT, 'packages/theme-base/stand/extension-purchase/dist/index.html')}`;

beforeAll(() => {
  // Стенд собирается из тех же исходников, что уходят на витрину.
  execFileSync(
    'pnpm',
    ['--dir', resolve(ROOT, 'packages/theme-base'), 'build:purchase-stand'],
    { stdio: 'ignore' },
  );
}, 60_000);

let shared: Promise<Browser> | null = null;
function browser(): Promise<Browser> {
  shared ??= chromium
    .launch()
    .catch(() => chromium.launch({ channel: 'chrome' }));
  return shared;
}
afterAll(async () => {
  const b = await shared;
  shared = null;
  await b?.close();
});

interface Look {
  fieldRadius: string;
  buttonRadius: string;
  buttonBg: string;
  buttonColor: string;
  font: string;
}

async function lookOf(query: string): Promise<Look> {
  const ctx = await (
    await browser()
  ).newContext({ viewport: { width: 390, height: 900 } });
  const page = await ctx.newPage();
  await page.goto(`${STAND}${query}`);
  await page.waitForTimeout(500);
  const look = await page.evaluate(() => {
    const form = document.querySelector('.xp');
    const field = form?.querySelector<HTMLElement>('.sf-in');
    const button = form?.querySelector<HTMLElement>('.sf-btn');
    if (field === null || button === null || form === null)
      throw new Error('форма не нарисована');
    const cs = (el: Element) => getComputedStyle(el);
    return {
      fieldRadius: cs(field).borderRadius,
      buttonRadius: cs(button).borderRadius,
      buttonBg: cs(button).backgroundColor,
      buttonColor: cs(button).color,
      font: cs(field).fontFamily,
    };
  });
  await ctx.close();
  return look;
}

describe('стенд формы покупки: ?look=satin — вычисленные стили из токенов satin', () => {
  it('скругления поля и кнопки 0px, шрифт Arsenal, кнопка из схемы 1', async () => {
    const look = await lookOf('?state=filled&look=satin');
    expect(look.fieldRadius).toBe('0px');
    expect(look.buttonRadius).toBe('0px');
    expect(look.font).toContain('Arsenal');
    expect(look.buttonBg).toBe('rgb(0, 0, 0)');
    expect(look.buttonColor).toBe('rgb(255, 255, 255)');
  });
});

describe('стенд формы покупки: ?look=rose — вычисленные стили из токенов rose', () => {
  it('скругления поля и кнопки 8px, шрифт Manrope, кнопка из схемы 1', async () => {
    const look = await lookOf('?state=filled&look=rose');
    expect(look.fieldRadius).toBe('8px');
    expect(look.buttonRadius).toBe('8px');
    expect(look.font).toContain('Manrope');
    expect(look.buttonBg).toBe('rgb(0, 0, 0)');
    expect(look.buttonColor).toBe('rgb(255, 255, 255)');
  });
});

describe('стенд формы покупки: ?look=vanilla — вычисленные стили из токенов vanilla', () => {
  it('скругления поля и кнопки 0px, шрифт Arsenal, кнопка из схемы 1', async () => {
    const look = await lookOf('?state=filled&look=vanilla');
    expect(look.fieldRadius).toBe('0px');
    expect(look.buttonRadius).toBe('0px');
    expect(look.font).toContain('Arsenal');
    expect(look.buttonBg).toBe('rgb(58, 69, 48)');
    expect(look.buttonColor).toBe('rgb(255, 255, 255)');
  });

  it('без параметра стенд прежний: палитра прототипа PM', async () => {
    const look = await lookOf('?state=filled');
    expect(look.fieldRadius).toBe('9px');
    expect(look.buttonRadius).toBe('9px');
    expect(look.buttonBg).toBe('rgb(20, 20, 20)');
    expect(look.font).toContain('Manrope');
  });
});
