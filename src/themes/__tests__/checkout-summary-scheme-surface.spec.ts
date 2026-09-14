/**
 * «СВОДКА ЗАКАЗА ПРИНИМАЕТ ИЗМЕНЁННЫЕ ЦВЕТОВЫЕ СХЕМЫ» — ВО ВСЕХ ПЯТИ ТЕМАХ.
 *
 * Пункт объявляли закрытым, но живая проверка прода дала 3 из 5. Замер на пяти
 * стендах (окно 1440×1400, два независимых прогона с совпавшими числами):
 * подмена схемы на обёртке ПРАВОЙ колонки чекаута —
 *
 *   rose    245,245,245 → 113,192,255   идёт за схемой
 *   satin   245,245,245 → 8,2,0         идёт
 *   flux     26,26,26   → 251,251,251   идёт
 *   vanilla 250,250,250 → 250,250,250   НЕ идёт
 *   bloom   246,246,247 → 246,246,247   НЕ идёт
 *
 * Тот же замер на сидовых данных магазина (`buildTokensCss` + общий
 * `CHECKOUT_SPLIT_CSS` + обёртка страницы из `themes/<t>/src/pages/checkout.astro`,
 * Chromium 1440×1400) воспроизвёл числа до единицы и показал, что дыра шире:
 * vanilla 250,250,250 → 250,250,250; bloom 246,246,247 → 246,246,247 и
 * flux 250,250,250 → 250,250,250 — то есть на СВЕЖЕМ магазине не работало
 * 3 темы из 5, а не 2. flux на стенде прошёл лишь потому, что у того сайта нет
 * мерчантских схем и правила печатались из манифеста дословно.
 *
 * ПРИЧИНА. `buildTokensCss` печатал `--color-surface` в правило `.color-scheme-N`
 * только при заданном поле `surfaceBg`, а отдельный `--color-checkout-surface`
 * считал при условии
 *
 *     merchantSurface !== null && merchantSurface === themeSurface
 *
 * «Поверхность задана и равна заводской». Поля `surfaceBg` в редакторе схем нет
 * и не будет (состав настроек — канон), а в сидах магазинов оно есть только у
 * rose и satin: `src/generator/templates/defaults/{vanilla,bloom,flux}.json`
 * несут схемы БЕЗ него. Для трёх тем из пяти «поля нет» — единственно возможное
 * состояние, поэтому условие молча выключалось, правило схемы не несло НИ
 * `--color-surface`, НИ `--color-checkout-surface`, и колонка садилась на
 * унаследованное значение, одинаковое для всех схем (у vanilla это 250 250 250
 * из `BASE_DEFAULTS`, у bloom — инлайновый набор из `themes/bloom/src/pages/
 * checkout.astro`).
 *
 * ПОЧЕМУ ЭТОГО НЕ ПОЙМАЛ СУЩЕСТВУЮЩИЙ ГАРД. `checkout-sections-round4` кормит
 * `buildTokensCss` фикстурой `themeToMerchantColorSchemes(theme)`, а она
 * собирается из манифеста функцией `themeSchemeToMerchantShape`, которая
 * `surfaceBg` ВСЕГДА проставляет. Гард сторожил свою фикстуру: данные, на
 * которых он зелёный, не встречаются у трёх тем из пяти.
 *
 * ПОЭТОМУ ЭТОТ ГАРД ЧИТАЕТ РЕАЛЬНЫЕ СИДЫ МАГАЗИНОВ — те самые json, из которых
 * `build.service.getDefaultRevisionData` строит первую ревизию сайта.
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

/** Правила `.color-scheme-N` собранного tokens-css: id → тело правила. */
function schemeRules(css: string): Map<string, string> {
  const out = new Map<string, string>();
  const re = /\.color-scheme-([A-Za-z0-9_-]+)\s*\{([^}]*)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(css))) out.set(m[1], m[2]);
  return out;
}

function varIn(body: string, name: string): string | null {
  return new RegExp(`${name}:\\s*([^;}]+)`).exec(body)?.[1]?.trim() ?? null;
}

/** Заводская поверхность схемы по манифесту темы: id без префикса → триплет. */
function factorySurfaces(theme: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const sc of getThemeManifest(theme)?.colorSchemes ?? []) {
    const v = (sc.tokens?.['--color-surface'] ?? '').trim().replace(/\s+/g, ' ');
    if (v) out.set(sc.id.replace(/^scheme-/, ''), v);
  }
  return out;
}

/**
 * ПРЕДИКАТ ГАРДА. Правая колонка может идти за схемой ровно тогда, когда правило
 * КАЖДОЙ схемы само объявляет поверхность чекаута. Нет объявления — значение
 * приезжает по наследству и на выбор схемы не реагирует, что замер и показал.
 */
function everySchemeDeclaresCheckoutSurface(css: string): {
  ok: boolean;
  total: number;
  без: string[];
} {
  const rules = schemeRules(css);
  const без: string[] = [];
  for (const [id, body] of rules) {
    if (!varIn(body, '--color-checkout-surface')) без.push(id);
  }
  return { ok: rules.size > 0 && без.length === 0, total: rules.size, без };
}

describe('поверхность «Сводки заказа» следует за схемой во всех пяти темах', () => {
  it.each(THEMES)('тема %s: каждая схема сидового магазина объявляет поверхность', (theme) => {
    const css = buildTokensCss(seedThemeSettings(theme), theme);
    const r = everySchemeDeclaresCheckoutSurface(css);
    expect(r.без).toEqual([]);
    expect(r.total).toBeGreaterThanOrEqual(4);
  });

  it.each(THEMES)('тема %s: поверхность равна заводской для каждой схемы', (theme) => {
    const css = buildTokensCss(seedThemeSettings(theme), theme);
    const rules = schemeRules(css);
    const factory = factorySurfaces(theme);
    expect(factory.size).toBeGreaterThanOrEqual(4);
    for (const [id, expected] of factory) {
      expect(varIn(rules.get(id) ?? '', '--color-checkout-surface')).toBe(expected);
    }
  });

  it.each(THEMES)('тема %s: у разных схем поверхность РАЗНАЯ — колонке есть куда двигаться', (theme) => {
    // Без этой проверки «каждая схема объявляет токен» прошло бы и на пяти
    // одинаковых значениях, то есть на неподвижной колонке.
    const css = buildTokensCss(seedThemeSettings(theme), theme);
    const значения = new Set(
      [...schemeRules(css).values()]
        .map((b) => varIn(b, '--color-checkout-surface'))
        .filter((v): v is string => v !== null),
    );
    expect(значения.size).toBeGreaterThanOrEqual(2);
  });

  it.each(THEMES)('тема %s: мерчант перекрасил «Фон» — поверхность идёт за ним', (theme) => {
    // #71C0FF — ровно тот цвет, на котором замер «до» показывал «не принимает».
    const settings = seedThemeSettings(theme);
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) =>
      sc.id === 'scheme-4' ? { ...sc, background: '#71C0FF' } : sc,
    );
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, theme);
    expect(varIn(schemeRules(css).get('4') ?? '', '--color-checkout-surface')).toBe(
      '113 192 255',
    );
  });

  it.each(THEMES)('тема %s: перекрасили одну — соседние остались заводскими', (theme) => {
    const settings = seedThemeSettings(theme);
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) =>
      sc.id === 'scheme-4' ? { ...sc, background: '#71C0FF' } : sc,
    );
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, theme);
    const rules = schemeRules(css);
    for (const [id, expected] of factorySurfaces(theme)) {
      if (id === '4') continue;
      expect(varIn(rules.get(id) ?? '', '--color-checkout-surface')).toBe(expected);
    }
  });

  it('сиды трёх тем действительно приходят без `surfaceBg` — условие было мёртвым', () => {
    // Если сиды когда-нибудь дополнят полем, гард об этом скажет: тогда старое
    // условие перестанет быть мёртвым, и разбор в шапке надо переписать.
    const без = THEMES.filter((t) =>
      ((seedThemeSettings(t).colorSchemes as Record<string, unknown>[]) ?? []).every(
        (sc) => sc.surfaceBg === undefined,
      ),
    );
    expect(без.sort()).toEqual(['bloom', 'flux', 'vanilla']);
  });

  // ── жалоба 15.09: «убрать в правой части серую подложку» ────────────────
  //
  // Дословно: «из-за неё цвета темнее выглядят по сравнению с цветовой схемой».
  // Замер собранных витрин пяти тем (Chromium 1440×1400, мерчант перекрасил
  // «Фон» схемы-4 в #71C0FF, схема стоит и на форме, и на сводке):
  //   ДО  — левая 113,192,255, правая: rose/satin 113,192,255 (шли за схемой),
  //         vanilla 250,250,250, flux 250,250,250, bloom 246,246,247 — та самая
  //         серая подложка, она же баг «Сводка не принимает схему» выше;
  //   ПОСЛЕ — правая 113,192,255 во всех пяти.
  // Это ОДНА и та же причина, поэтому и проверка одна: когда мерчант перекрасил
  // «Фон», поверхность сводки обязана совпасть с фоном формы, а не остаться на
  // унаследованном сером.
  it.each(THEMES)('тема %s: перекрасили «Фон» — серой подложки справа не остаётся', (theme) => {
    const settings = seedThemeSettings(theme);
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) =>
      sc.id === 'scheme-4' ? { ...sc, background: '#71C0FF' } : sc,
    );
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, theme);
    const body = schemeRules(css).get('4') ?? '';
    const surface = varIn(body, '--color-checkout-surface');
    const bg = varIn(body, '--color-bg');
    // Правая колонка красится поверхностью, левая — фоном. Равенство и означает
    // «подложки нет»: одна схема — один цвет на обе половины.
    expect(surface).toBe('113 192 255');
    expect(surface).toBe(bg);
  });

  it('САБОТАЖ: поверхность отвязали от перекрашенного «Фона» → подложка возвращается', () => {
    // Подменяем значение токена на заводскую серую поверхность темы — ровно то,
    // что давал прежний генератор у vanilla/bloom/flux.
    const settings = seedThemeSettings('vanilla');
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) =>
      sc.id === 'scheme-4' ? { ...sc, background: '#71C0FF' } : sc,
    );
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, 'vanilla');
    const испорчен = css.replace(
      /--color-checkout-surface:\s*113 192 255/,
      '--color-checkout-surface: 250 250 250',
    );
    expect(испорчен).not.toEqual(css);
    const body = schemeRules(испорчен).get('4') ?? '';
    expect(varIn(body, '--color-checkout-surface')).toBe('250 250 250');
    expect(varIn(body, '--color-checkout-surface')).not.toBe(varIn(body, '--color-bg'));
  });

  // ── жалоба 15.09: «убрать тёмные очертания по периметру» ────────────────
  //
  // Замер собранной витрины (Chromium 1440×1400, схема с «Фоном» #71C0FF): у
  // каждого поля чекаута рамка 1px — rose rgb(153,153,153), остальные четыре
  // rgb(210,210,210). На светло-голубой подложке это чужая тёмная обводка.
  //
  // Причина: `--color-input-border` объявлен в реестре токенов как
  // `scope: 'scheme'`, но НИ ОДНА тема не кладёт его в схемы — генератор печатал
  // его только в `:root`, одним значением на все схемы.
  //
  // Просто убрать нельзя: фон поля `--color-input-bg` во всех пяти темах белый,
  // и контраст «поле ↔ подложка схемы» ниже 1.2 в ТРИНАДЦАТИ связках из 21 —
  // там рамка единственное, что очерчивает поле. Поэтому она остаётся ровно
  // там, где нужна, и исчезает там, где поле читается само.
  const INPUT_BG = '255 255 255';
  /** Контраст WCAG двух триплетов — та же формула, что в генераторе. */
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

  it.each(THEMES)('тема %s: рамка поля объявлена у каждой схемы', (theme) => {
    const css = buildTokensCss(seedThemeSettings(theme), theme);
    const без: string[] = [];
    for (const [id, body] of schemeRules(css)) {
      if (!varIn(body, '--color-input-border')) без.push(id);
    }
    expect(без).toEqual([]);
  });

  it.each(THEMES)('тема %s: рамка есть там, где поле сливается, и снята там, где нет', (theme) => {
    const css = buildTokensCss(seedThemeSettings(theme), theme);
    let сливается = 0;
    let читается = 0;
    for (const [id, body] of schemeRules(css)) {
      const bg = varIn(body, '--color-bg');
      const border = varIn(body, '--color-input-border');
      if (!bg || !border) continue;
      if (contrast(INPUT_BG, bg) < 1.5) {
        // поле неотличимо от подложки → рамка обязана быть видимой
        expect(border).not.toBe(INPUT_BG);
        сливается++;
      } else {
        // поле читается само → рамка цвета поля, то есть её не видно
        expect(border).toBe(INPUT_BG);
        читается++;
      }
    }
    expect(сливается + читается).toBeGreaterThanOrEqual(4);
  });

  it('по всей матрице: рамка нужна ровно в 13 связках из 21', () => {
    // Это и есть довод «нельзя просто убрать»: на 13 экранах из 21 рамка —
    // единственное очертание поля. Если завтра цифра поедет, значит поехали
    // палитры тем, и решение надо пересматривать, а не проспать.
    let нужна = 0;
    let всего = 0;
    for (const theme of THEMES) {
      const css = buildTokensCss(seedThemeSettings(theme), theme);
      for (const [, body] of schemeRules(css)) {
        const border = varIn(body, '--color-input-border');
        if (!border) continue;
        всего++;
        if (border !== INPUT_BG) нужна++;
      }
    }
    expect(всего).toBe(21);
    expect(нужна).toBe(13);
  });

  it.each(THEMES)('тема %s: перекрасили «Фон» — тёмной обводки у поля не остаётся', (theme) => {
    const settings = seedThemeSettings(theme);
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) =>
      sc.id === 'scheme-4' ? { ...sc, background: '#71C0FF' } : sc,
    );
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, theme);
    expect(varIn(schemeRules(css).get('4') ?? '', '--color-input-border')).toBe(INPUT_BG);
  });

  it('САБОТАЖ: рамку вернули к прежнему одному значению на все схемы', () => {
    const css = buildTokensCss(seedThemeSettings('rose'), 'rose');
    const испорчен = css.replace(/--color-input-border:\s*255 255 255/g, '--color-input-border: 153 153 153');
    expect(испорчен).not.toEqual(css);
    // на схеме-4 rose поле читается само (чёрная подложка) — рамка обязана быть
    // снята; саботаж возвращает серую, и проверка обязана это увидеть
    expect(varIn(schemeRules(испорчен).get('4') ?? '', '--color-input-border')).toBe('153 153 153');
    expect(varIn(schemeRules(css).get('4') ?? '', '--color-input-border')).toBe(INPUT_BG);
  });

  it('САБОТАЖ: рамку сняли ВЕЗДЕ → поля сливаются с подложкой на 13 связках', () => {
    let потеряно = 0;
    for (const theme of THEMES) {
      const css = buildTokensCss(seedThemeSettings(theme), theme);
      const испорчен = css.replace(/--color-input-border:\s*[^;}]+/g, '--color-input-border: 255 255 255');
      for (const [, body] of schemeRules(испорчен)) {
        const bg = varIn(body, '--color-bg');
        const border = varIn(body, '--color-input-border');
        if (bg && border === INPUT_BG && contrast(INPUT_BG, bg) < 1.5) потеряно++;
      }
    }
    expect(потеряно).toBe(13);
  });

  it('САБОТАЖ-КАЛИБРОВКА: правка НЕсторожимого не трогает рамку', () => {
    const settings = seedThemeSettings('satin');
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) => ({
      ...sc,
      secondaryButton: { background: '#654321', text: '#ffffff', border: '#654321' },
    }));
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, 'satin');
    expect(css).toContain('--color-button-secondary-bg: 101 67 33');
    const без: string[] = [];
    for (const [id, body] of schemeRules(css)) {
      if (!varIn(body, '--color-input-border')) без.push(id);
    }
    expect(без).toEqual([]);
  });

  it('колонка читает именно этот токен, а фолбэк оставлен прежний', () => {
    expect(CHECKOUT_SPLIT_CSS).toContain(
      '[data-checkout-pane="summary"] { background: rgb(var(--color-checkout-surface, var(--color-surface, 245 245 245))); }',
    );
  });

  it('САБОТАЖ: убрали объявление у одной схемы → гард краснеет с номером', () => {
    const css = buildTokensCss(seedThemeSettings('vanilla'), 'vanilla');
    const испорчен = css.replace(/;\s*--color-checkout-surface:[^;}]+/, '');
    expect(испорчен).not.toEqual(css);
    const r = everySchemeDeclaresCheckoutSurface(испорчен);
    expect(r.ok).toBe(false);
    expect(r.без.length).toBe(1);
  });

  it('САБОТАЖ: убрали объявления у всех схем → гард краснеет по всем', () => {
    const css = buildTokensCss(seedThemeSettings('bloom'), 'bloom');
    const испорчен = css.replace(/;\s*--color-checkout-surface:[^;}]+/g, '');
    const r = everySchemeDeclaresCheckoutSurface(испорчен);
    expect(r.ok).toBe(false);
    expect(r.без.length).toBe(r.total);
    expect(r.total).toBeGreaterThanOrEqual(4);
  });

  it('САБОТАЖ-КАЛИБРОВКА: правим НЕсторожимое → гард остаётся зелёным', () => {
    // Меняем цвет кнопки — к поверхности чекаута отношения не имеет. Если бы
    // предикат краснел и здесь, он сторожил бы «что угодно», а не поверхность.
    const settings = seedThemeSettings('flux');
    const schemes = (settings.colorSchemes as Record<string, unknown>[]).map((sc) => ({
      ...sc,
      primaryButton: { background: '#123456', text: '#ffffff', border: '#123456' },
    }));
    const css = buildTokensCss({ ...settings, colorSchemes: schemes }, 'flux');
    expect(css).toContain('--color-button-bg: 18 52 86');
    expect(everySchemeDeclaresCheckoutSurface(css).ok).toBe(true);
  });

  it('САБОТАЖ-КАЛИБРОВКА: пустой CSS замер видит как красноту, а не как «чисто»', () => {
    const r = everySchemeDeclaresCheckoutSurface('');
    expect(r.ok).toBe(false);
    expect(r.total).toBe(0);
  });
});
