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
