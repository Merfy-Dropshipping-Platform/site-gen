import { describe, expect, it } from 'vitest';
import type { SectionManifest } from '../src/format';
import { NAMES } from '../src/names';
import { checkScriptSource } from '../src/script-check';
import { nameProblems } from '../src/script-names';

// theme-setting-unknown (блок 9 «Секций и SDK», часть 9б; design.md блока 9, п. 16 и 9.10): в ctx.theme['<имя>'] — только
// сквозные настройки темы (NAMES.shared: поля панели с "shared": true). Место — строка имени настройки.
const MANIFEST: SectionManifest = {
  sdk: 1,
  name: 'cart-button',
  kind: 'section',
  title: 'Кнопка корзины',
  settings: [],
  uses: ['theme'],
};
const HEAD = "import { defineSection } from '@merfy/shell';\n";
const KNOWN =
  '«logo-image», «social-telegram», «social-vk», «social-dzen», «social-youtube», «social-tiktok», «social-max», ' +
  '«cart-type», «cookie-banner-enabled», «wishlist-enabled»';

// Скрипт секции с одним действием open: body — строки тела действия.
const sectionScript = (body: readonly string[], imports = ''): string =>
  `${HEAD}${imports}export default defineSection({\n  actions: {\n    open(_target, ctx) {\n${body.map((line) => `      ${line}\n`).join('')}    },\n  },\n});\n`;

function problemsOf(files: Readonly<Record<string, string>>): string[] {
  const { facts } = checkScriptSource(files, 'script.ts');
  return nameProblems({ manifest: MANIFEST, markup: { actions: [] }, facts, scriptEntry: 'script.ts' }).map(
    (item) => `${item.code} ${item.file}:${item.line} ${item.message}`,
  );
}

describe('theme-setting-unknown', () => {
  it('известные имена через точку, строкой в [] и через const { theme } = ctx — без проблем', () => {
    const script = sectionScript([
      'const { theme } = ctx;',
      "ctx.log(ctx.theme['cart-type'], theme['logo-image'], ctx.theme);",
    ]);
    expect(problemsOf({ 'script.ts': script })).toEqual([]);
  });

  it('незнакомое имя — строка имени, список и похожее; в своём файле с ctx — тоже', () => {
    const imports = "import { openCart } from './lib/cart.ts';\n";
    const script = sectionScript(['openCart(ctx);', "ctx.log(ctx.theme['cart-typ']);"], imports);
    const lib = `import type { Ctx } from '@merfy/shell';\nexport function openCart(ctx: Ctx): void {\n  ctx.log(ctx.theme['drawer-side']);\n}\n`;
    expect(problemsOf({ 'script.ts': script, 'lib/cart.ts': lib }).sort()).toEqual([
      `theme-setting-unknown lib/cart.ts:3 настройки темы «drawer-side» нет в ctx.theme. Есть: ${KNOWN}`,
      `theme-setting-unknown script.ts:7 настройки темы «cart-typ» нет в ctx.theme. Есть: ${KNOWN}. Похожее: «cart-type»`,
    ]);
  });

  it('имя из выражения и ctx.theme целиком не сверяются', () => {
    const script = sectionScript([
      "const name = 'cart' + '-type';",
      'ctx.log(ctx.theme[name], Object.keys(ctx.theme));',
    ]);
    expect(problemsOf({ 'script.ts': script })).toEqual([]);
  });

  it('имена — сквозные настройки панели платформы (generated/shared-settings.json)', () => {
    expect(NAMES.shared.map((item) => item.id)).toEqual([
      'logo-image',
      'social-telegram',
      'social-vk',
      'social-dzen',
      'social-youtube',
      'social-tiktok',
      'social-max',
      'cart-type',
      'cookie-banner-enabled',
      'wishlist-enabled',
    ]);
  });
});
