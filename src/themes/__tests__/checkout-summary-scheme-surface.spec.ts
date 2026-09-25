/**
 * ТРИ ПУНКТА ВЛАДЕЛЬЦА 16.09 (задача b31-checkout) — «Сводка заказа» и поля
 * формы чекаута.
 *
 * ═══ ТОЧКА 1: подложка правой части ═══════════════════════════════════════
 *
 * Владелец прислал скриншот Схемы 1 (Фон #000000, Заголовок #FFFFFF,
 * Текст #FFFFFF) и написал дословно: «цвет тот же, схема та же, но они
 * различаются» — левая колонка (форма) и правая (сводка) обе тёмные, но
 * граница между ними видна.
 *
 * ИСТОРИЯ (для контекста, поведение уже не действует). До 14.09 колонка
 * сводки красилась `--color-surface` темы — общим токеном витрины (карточки
 * товара, плитки коллекций), значение которого мерчант в редакторе схем
 * менять не мог (поля `surfaceBg` там нет). 14.09 завели отдельный токен
 * `--color-checkout-surface` (`checkoutSurfaceOf`), чтобы «перекрасил Фон —
 * поверхность идёт за ним»; 15.09 сделали его тотальным (у каждой схемы).
 * Итог замера «до» на сидовых данных (16.09, buildTokensCss + СИДЫ пяти тем):
 * поверхность отличалась от «Фона» у rose (все 5 схем), satin (2 из 4), flux
 * (все 4) — конкретно те же числа, что снял владелец на живом стенде:
 *
 *   satin  scheme-1: bg=255 255 255  surface=245 245 245  (владелец: тот же случай)
 *   flux   scheme-2: bg=255 255 255  surface=251 251 251  (владелец: тот же случай)
 *   rose   scheme-4: bg=0 0 0        surface=26 26 26     (Схема владельца — Фон #000000)
 *
 * РЕШЕНИЕ 16.09. Концепция отдельной поверхности чекаута СНЯТА. Правая
 * колонка красится ТЕМ ЖЕ `--color-bg`, что и левая — `[data-checkout-pane=
 * "summary"]` в `checkout-split.ts` дословно повторяет `[data-checkout-pane=
 * "form"]`. Токен `--color-checkout-surface` больше не считается вообще:
 * `checkoutSurfaceOf` удалена из `tokens-css.ts`.
 *
 * ═══ ТОЧКА 3: тёмные очертания по периметру полей ═════════════════════════
 *
 * Владелец: «убрать». Односложно.
 *
 * ИСТОРИЯ. 15.09 завели контраст-порог (`inputBorderOf`): рамка оставалась
 * ВИДНОЙ там, где белое поле (`--color-input-bg: 255 255 255`) сливалось со
 * светлой подложкой схемы (контраст < 1.5) — 13 связок из 21 (rose 1/2/3/5,
 * vanilla 3/4, bloom 3/4, satin 1/2/3, flux 2/3) — и снималась там, где поле
 * читалось само.
 *
 * РЕШЕНИЕ 16.09. Владелец отменил условие целиком: рамка теперь ВСЕГДА
 * цвета самого поля — то есть невидима на любой схеме любой темы, БЕЗ
 * исключений. `inputBorderOf` больше не считает контраст.
 *
 * ЧЕМ ПЛАТИМ (владелец должен увидеть это числом, не только словом
 * «убрано»): в тех же 13 связках из 21 контраст «поле ↔ подложка» остаётся
 * НИЖЕ 1.5 — без рамки поле визуально СЛИВАЕТСЯ с подложкой, различим только
 * курсор фокуса при клике. Это не регресс, а прямое следствие дословного
 * пункта 3 — гард проверяет ЧИСЛОМ, что деградация ограничена именно этими
 * связками и не расползлась шире.
 *
 * Гарды стоят на buildTokensCss (сидовые данные пяти тем — тот же путь,
 * которым магазин рождается), а не на живом рендере: браузера в CI нет.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTokensCss } from '../tokens-css';
import { getThemeManifest } from '../theme-manifest-loader';
import { CHECKOUT_SPLIT_CSS } from '../../../packages/theme-base/blocks/CheckoutLayout/checkout-split';

const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;
const REPO = resolve(__dirname, '../../..');

/** Настройки темы ровно те, с которыми магазин рождается. */
function seedThemeSettings(theme: string): Record<string, unknown> {
  const path = resolve(REPO, 'src/generator/templates/defaults', `${theme}.json`);
  const seed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  return (seed.themeSettings ?? {}) as Record<string, unknown>;
}

/**
 * Правила `.color-scheme-N` собранного tokens-css: id → тело правила.
 *
 * ТОЛЬКО числовые id (1..5, редактируемые мерчантом схемы темы). b35 завёл
 * `.color-scheme-checkout` — отдельную, НЕЧИСЛОВУЮ «схему» чекаута
 * (`CHECKOUT_SCHEME_CSS`, `tokens-css.ts`), фиксированный платформенный
 * константный набор из 5 переменных (специально БЕЗ `--color-input-border` —
 * состав дословно повторяет прежнюю инлайн-заплатку bloom). Она не входит в
 * мерчантский список схем и не обязана нести тот же набор переменных, что
 * schemeToVars даёт каждой из 1..5 — если ловить её этим сканом, «21 связка
 * (5 тем)» ниже превратилась бы в 26, а «рамка объявлена у каждой схемы»
 * ловила бы chекаут как схему без рамки. Гард на саму `.color-scheme-checkout`
 * — отдельный файл `checkout-scheme-parity.spec.ts`.
 */
function schemeRules(css: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /\.color-scheme-([0-9]+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.set(m[1], m[2]);
  return out;
}

function varIn(body: string, name: string): string | null {
  return new RegExp(`${name}:\\s*([^;}]+)`).exec(body)?.[1]?.trim() ?? null;
}

// ════════════════════════════════════════════════════════════════════════
// ТОЧКА 1 — поверхность правой колонки снята, колонка красится «Фоном»
// ════════════════════════════════════════════════════════════════════════

describe('ТОЧКА 1: правая колонка чекаута = «Фон» схемы, отдельной поверхности нет', () => {
  it('CSS-правило колонки читает --color-bg, а не --color-checkout-surface', () => {
    expect(CHECKOUT_SPLIT_CSS).toContain(
      '[data-checkout-pane="summary"] { background: rgb(var(--color-bg, 255 255 255)); }',
    );
  });

  it('правило сводки ПОБУКВЕННО совпадает с правилом формы (одна и та же покраска)', () => {
    const summary = /\[data-checkout-pane="summary"\]\s*\{\s*background:[^}]*\}/.exec(
      CHECKOUT_SPLIT_CSS,
    )?.[0];
    const form = /\[data-checkout-pane="form"\]\s*\{\s*background:[^}]*\}/.exec(
      CHECKOUT_SPLIT_CSS,
    )?.[0];
    expect(summary).toBeTruthy();
    expect(form).toBeTruthy();
    expect(summary!.replace('summary', 'form')).toBe(form);
  });

  it('ни одно CSS-правило (не комментарий!) не читает var(--color-checkout-surface', () => {
    // Ловушка README qa/lib: гард регуляркой обязан вырезать комментарии —
    // /* ... */ в этом же файле дословно ОБСУЖДАЕТ снятый токен (история
    // правки), и наивный `.not.toContain('checkout-surface')` красился бы
    // на собственном docblock, а не на реальном коде.
    const withoutComments = CHECKOUT_SPLIT_CSS.replace(/\/\*[\s\S]*?\*\//g, '');
    expect(withoutComments).not.toContain('checkout-surface');
  });

  it.each(THEMES)(
    'тема %s: --color-checkout-surface не эмитится НИ в одной схеме собранного tokens-css',
    (theme) => {
      const css = buildTokensCss(seedThemeSettings(theme), theme);
      expect(css).not.toContain('--color-checkout-surface');
    },
  );

  // ── замер «до/после» на тех же числах, что снял владелец ────────────────
  it.each([
    ['satin', '1', '255 255 255', '245 245 245'],
    ['flux', '2', '255 255 255', '251 251 251'],
    ['rose', '4', '0 0 0', '26 26 26'],
  ] as const)(
    'тема %s scheme-%s: «до» surface=%s отличался от bg=%s — «после» правая колонка красится bg',
    (theme, schemeId, bg, _surfaceBefore) => {
      const css = buildTokensCss(seedThemeSettings(theme), theme);
      const body = schemeRules(css).get(schemeId) ?? '';
      // «после»: единственный источник цвета колонки — --color-bg, и он
      // ровно тот, что видит левая колонка (то же правило CSS, см. тест выше).
      expect(varIn(body, '--color-bg')).toBe(bg);
      expect(css).not.toContain('--color-checkout-surface');
    },
  );

  it('мерчант осознанно задал свою поверхность (surfaceBg) — БОЛЬШЕ НЕ уважаем: колонка идёт за «Фоном»', () => {
    // До 16.09 этот случай (тёмный сайдбар корзины поверх перекрашенного
    // «Фона») был единственным приоритетом checkoutSurfaceOf — колонка
    // красилась surfaceBg, а не «Фоном». Владелец 16.09 отменил это условие
    // целиком: различия быть не должно, откуда бы оно ни бралось.
    const settings = seedThemeSettings('rose');
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) =>
      sc.id === 'scheme-4'
        ? { ...sc, background: '#71C0FF', surfaceBg: '#102030' }
        : sc,
    );
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, 'rose');
    const body = schemeRules(css).get('4') ?? '';
    expect(varIn(body, '--color-bg')).toBe('113 192 255');
    expect(css).not.toContain('--color-checkout-surface');
  });

  it('перекрасили «Фон» одной схемы — соседние остаются на СВОЁМ «Фоне» (не заморожены)', () => {
    const settings = seedThemeSettings('rose');
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) =>
      sc.id === 'scheme-4' ? { ...sc, background: '#71C0FF' } : sc,
    );
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, 'rose');
    const rules = schemeRules(css);
    expect(varIn(rules.get('4') ?? '', '--color-bg')).toBe('113 192 255');
    // Заводские «Фоны» rose (packages/theme-rose/theme.json) — не тронуты.
    expect(varIn(rules.get('3') ?? '', '--color-bg')).toBe('245 240 235');
    expect(varIn(rules.get('2') ?? '', '--color-bg')).toBe('255 255 255');
  });

  it('САБОТАЖ: вернули отдельный --color-checkout-surface в CSS-правило → предикат «одно правило» краснеет', () => {
    const sabotaged = CHECKOUT_SPLIT_CSS.replace(
      '[data-checkout-pane="summary"] { background: rgb(var(--color-bg, 255 255 255)); }',
      '[data-checkout-pane="summary"] { background: rgb(var(--color-checkout-surface, var(--color-surface, 245 245 245))); }',
    );
    expect(sabotaged).not.toEqual(CHECKOUT_SPLIT_CSS);
    const summary = /\[data-checkout-pane="summary"\]\s*\{\s*background:[^}]*\}/.exec(sabotaged)?.[0];
    const form = /\[data-checkout-pane="form"\]\s*\{\s*background:[^}]*\}/.exec(sabotaged)?.[0];
    expect(summary!.replace('summary', 'form')).not.toBe(form);
    expect(sabotaged).toContain('checkout-surface');
  });

  it('САБОТАЖ-КАЛИБРОВКА: правка НЕсторожимого (цвет кнопки) не трогает CSS-правило колонки', () => {
    const settings = seedThemeSettings('flux');
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) => ({
      ...sc,
      primaryButton: { background: '#123456', text: '#ffffff', border: '#123456' },
    }));
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, 'flux');
    expect(css).toContain('--color-button-bg: 18 52 86');
    expect(css).not.toContain('--color-checkout-surface');
    expect(CHECKOUT_SPLIT_CSS).toContain(
      '[data-checkout-pane="summary"] { background: rgb(var(--color-bg, 255 255 255)); }',
    );
  });
});

// ════════════════════════════════════════════════════════════════════════
// ТОЧКА 3 — рамка поля снята ВЕЗДЕ, без контраст-исключений
// ════════════════════════════════════════════════════════════════════════

const INPUT_BG = '255 255 255';

/** Контраст WCAG двух триплетов — та же формула, что раньше стояла в генераторе. */
function contrast(a: string, b: string): number {
  const lin = (c: number) => {
    const x = c / 255;
    return x <= 0.03928 ? x / 12.92 : ((x + 0.055) / 1.055) ** 2.4;
  };
  const lum = (v: string) => {
    const [r, g, bl] = v.trim().split(/\s+/).map(Number);
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(bl);
  };
  const la = lum(a);
  const lb = lum(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

describe('ТОЧКА 3: рамка поля снята ВЕЗДЕ — без исключений по контрасту', () => {
  it.each(THEMES)('тема %s: рамка объявлена у каждой схемы (инвариант не сломан)', (theme) => {
    const css = buildTokensCss(seedThemeSettings(theme), theme);
    const без: string[] = [];
    for (const [id, body] of schemeRules(css)) {
      if (!varIn(body, '--color-input-border')) без.push(id);
    }
    expect(без).toEqual([]);
  });

  it.each(THEMES)('тема %s: рамка ВСЕГДА цвета поля (255 255 255) — контраст со схемой больше не проверяем', (theme) => {
    const css = buildTokensCss(seedThemeSettings(theme), theme);
    let проверено = 0;
    for (const [, body] of schemeRules(css)) {
      const border = varIn(body, '--color-input-border');
      if (!border) continue;
      expect(border).toBe(INPUT_BG);
      проверено++;
    }
    expect(проверено).toBeGreaterThanOrEqual(4);
  });

  // 26.09: 23 связки — vanilla и flux получили схему 5 (кнопки по вёрстке,
  // scheme-button-defaults.spec.ts); обе тёмная/белая, рамка поля та же.
  it('по всей матрице (23 связки, 5 тем): рамка не видна НИГДЕ — «после» 0 из 23', () => {
    let видна = 0;
    let всего = 0;
    for (const theme of THEMES) {
      const css = buildTokensCss(seedThemeSettings(theme), theme);
      for (const [, body] of schemeRules(css)) {
        const border = varIn(body, '--color-input-border');
        if (!border) continue;
        всего++;
        if (border !== INPUT_BG) видна++;
      }
    }
    expect(всего).toBe(23);
    expect(видна).toBe(0);
  });

  it('ЧЕМ ПЛАТИМ: в прежних 13 связках контраст «поле↔подложка» остаётся ниже 1.5 — поле визуально сливается', () => {
    // Это тот самый компромисс, о котором просили сказать числом. Список
    // связок — те же 13, что раньше держали рамку (замер «до», docblock файла).
    const НИЗКИЙ_КОНТРАСТ: Array<[string, string]> = [
      ['rose', '1'], ['rose', '2'], ['rose', '3'], ['rose', '5'],
      ['vanilla', '3'], ['vanilla', '4'],
      ['bloom', '3'], ['bloom', '4'],
      ['satin', '1'], ['satin', '2'], ['satin', '3'],
      ['flux', '2'], ['flux', '3'],
    ];
    expect(НИЗКИЙ_КОНТРАСТ.length).toBe(13);
    let сливается = 0;
    for (const [theme, schemeId] of НИЗКИЙ_КОНТРАСТ) {
      const css = buildTokensCss(seedThemeSettings(theme), theme);
      const body = schemeRules(css).get(schemeId) ?? '';
      const bg = varIn(body, '--color-bg');
      const border = varIn(body, '--color-input-border');
      expect(bg).toBeTruthy();
      expect(border).toBe(INPUT_BG); // рамка снята — точка 3
      const c = contrast(INPUT_BG, bg!);
      expect(c).toBeLessThan(1.5); // …и поле визуально сливается с подложкой
      сливается++;
    }
    expect(сливается).toBe(13);
  });

  it.each(THEMES)('тема %s: перекрасили «Фон» — рамка остаётся невидимой (не регрессирует к тёмной)', (theme) => {
    const settings = seedThemeSettings(theme);
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) =>
      sc.id === 'scheme-4' ? { ...sc, background: '#71C0FF' } : sc,
    );
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, theme);
    expect(varIn(schemeRules(css).get('4') ?? '', '--color-input-border')).toBe(INPUT_BG);
  });

  it('САБОТАЖ: вернули контраст-порог (рамку темы там, где сливается) → «0 из 21» краснеет с числом', () => {
    const css = buildTokensCss(seedThemeSettings('rose'), 'rose');
    // Симулируем откат к 15.09-поведению: rose-схема-1 (белое на белом,
    // сливается) получает обратно тёмную рамку 153 153 153.
    const испорчен = css.replace(
      /(\.color-scheme-1\s*\{[^}]*--color-input-border:\s*)255 255 255/,
      '$1153 153 153',
    );
    expect(испорчен).not.toEqual(css);
    let видна = 0;
    let всего = 0;
    for (const [, body] of schemeRules(испорчен)) {
      const border = varIn(body, '--color-input-border');
      if (!border) continue;
      всего++;
      if (border !== INPUT_BG) видна++;
    }
    // rose несёт 5 схем (scheme-1..5) — саботаж тронул только scheme-1.
    expect(всего).toBe(5);
    expect(видна).toBe(1); // саботаж вернул ровно одну видимую рамку — гард её ловит
  });

  it('САБОТАЖ-КАЛИБРОВКА: правка НЕсторожимого (цвет второй кнопки) не трогает рамку', () => {
    const settings = seedThemeSettings('satin');
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) => ({
      ...sc,
      secondaryButton: { background: '#654321', text: '#ffffff', border: '#654321' },
    }));
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, 'satin');
    expect(css).toContain('--color-button-secondary-bg: 101 67 33');
    for (const [, body] of schemeRules(css)) {
      const border = varIn(body, '--color-input-border');
      if (border) expect(border).toBe(INPUT_BG);
    }
  });

  it('САБОТАЖ-КАЛИБРОВКА: пустой CSS замер видит как красноту (0 связок < минимума), а не как «чисто»', () => {
    let всего = 0;
    for (const [, body] of schemeRules('')) {
      if (varIn(body, '--color-input-border')) всего++;
    }
    expect(всего).toBe(0);
  });
});

// ════════════════════════════════════════════════════════════════════════
// Вспомогательное: манифест темы (используется для проверки, что заводские
// схемы вообще существуют — иначе it.each по THEMES проверял бы пустоту).
// ════════════════════════════════════════════════════════════════════════

describe('калибровка окружения гарда', () => {
  it.each(THEMES)('тема %s: манифест несёт хотя бы одну цветовую схему', (theme) => {
    const manifest = getThemeManifest(theme);
    expect((manifest?.colorSchemes ?? []).length).toBeGreaterThan(0);
  });

  it.each(THEMES)('тема %s: сид магазина несёт хотя бы одну схему мерчанта', (theme) => {
    const settings = seedThemeSettings(theme);
    expect(
      Array.isArray(settings.colorSchemes) && (settings.colorSchemes as unknown[]).length,
    ).toBeGreaterThan(0);
  });
});
