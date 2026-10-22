import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { namesMarkdown } from '../src/generate/names-markdown';

const PACKAGE_DIR = fileURLToPath(new URL('..', import.meta.url));

interface Run {
  code: number;
  stdout: string;
}

function merfy(...args: string[]): Promise<Run> {
  return new Promise((resolve) => {
    execFile(process.execPath, ['--import', 'tsx', 'scripts/merfy.ts', ...args], { cwd: PACKAGE_DIR }, (error, stdout) =>
      resolve({ code: error === null ? 0 : Number(Reflect.get(error, 'code')), stdout }),
    );
  });
}

// Порядок — Р3.16: имена, лимиты, условия.
const FIELDS_BROKEN = [
  'section.json:7:13 — поле `coatColor`: такого имени нет в словаре, ближе всего — `color-scheme` [setting-name-unknown]',
  'section.json:8:13 — поле `layout`: такого имени нет в словаре. Секция другого вида — новая секция: её делает ИИ или ' +
    'автор. Мелкие отличия — поля `image-position`, `columns`, `height` [setting-name-unknown]',
  'section.json:9:13 — поле `cart-type`: такого имени нет в словаре. Это настройка «Настроек темы» «Корзина → Вид ' +
    'корзины»; секция её читает: `"uses": ["theme"]`, в шаблоне `theme[\'cart-type\']` [setting-name-unknown]',
  'section.json:10:67 — поле `heading`: в словаре это `string`, здесь `text`; имена с видом `text` — `text` [setting-name-kind]',
  'section.json:6:15 — полей у секции — 21, можно не больше 20 [settings-limit]',
  'section.json:13:65 — поле `height`: вариантов — 11, можно от 2 до 10 [settings-limit]',
  'section.json:30:67 — поле `text-size`: цепочка условий длиннее двух — `text-size` → `aspect-ratio` → ' +
    '`content-position` → `autoplay` [visible-when-invalid]',
  'section.json:31:76 — поле `logo-position`: условия по кругу — `logo-position` → `menu-type` → `logo-position` ' +
    '[visible-when-invalid]',
  'section.json:32:62 — поле `menu-type`: условия по кругу — `menu-type` → `logo-position` → `menu-type` ' +
    '[visible-when-invalid]',
];

describe('pnpm merfy: правила полей', () => {
  it('сломанные поля — все ошибки разом, строка на ошибку с местом и кодом, выход 1', async () => {
    expect(await merfy('section', 'check', 'fixtures/broken/fields-broken')).toEqual({
      code: 1,
      stdout: FIELDS_BROKEN.map((line) => `${line}\n`).join(''),
    });
  }, 30_000);

  it('«Буквица заголовка»: с пустым заголовком шаблон падает — render-empty-failed', async () => {
    const run = await merfy('section', 'check', 'fixtures/broken/heading-letter');
    expect(run.code).toBe(1);
    expect(run.stdout).toMatch(
      /^template\.astro — шаблон не отрисовался с пустыми значениями настроек: .*toUpperCase.* \[render-empty-failed\]\n$/,
    );
  }, 30_000);

  it('section names — словарь текстом NAMES.md, выход 0', async () => {
    expect(await merfy('section', 'names')).toEqual({ code: 0, stdout: namesMarkdown() });
  }, 30_000);
});
