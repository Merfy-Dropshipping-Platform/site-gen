/**
 * Spec 082 Stage 2a N4.5 — merchant precedence in buildTokensCss.
 *
 * Pre-fix: `themeFirst()` made theme manifest defaults always win over
 * merchant overrides for radii/fonts/sizes/spacing — silently discarding
 * any value typed into ThemeSettingsPanel. This test pins the new
 * "merchant wins" cascade so future refactors can't regress it.
 */
import { buildTokensCss, themeSchemeToMerchantShape } from './tokens-css';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('buildTokensCss merchant precedence', () => {
  it('merchant buttonRadius overrides Rose manifest default (6px)', () => {
    const css = buildTokensCss({ buttonRadius: 24 }, 'rose');
    expect(css).toContain('--radius-button: 24px');
  });

  it('manifest default used when merchant did not set buttonRadius', () => {
    const css = buildTokensCss({}, 'rose');
    // Rose manifest has --radius-button: 6px
    expect(css).toContain('--radius-button: 6px');
  });

  it('hardcoded fallback used when no merchant + no manifest', () => {
    const css = buildTokensCss({}, null);
    // No theme → hardcoded '0px'
    expect(css).toContain('--radius-button: 0px');
  });

  it('merchant headingFont overrides Rose Comfortaa', () => {
    const css = buildTokensCss({ headingFont: 'inter' }, 'rose');
    // fontFamily('inter') → "Inter" stack
    expect(css).toMatch(/--font-heading:\s*"Inter"/);
  });

  it('merchant cardRadius overrides manifest', () => {
    const css = buildTokensCss({ cardRadius: 16 }, 'rose');
    expect(css).toContain('--radius-card: 16px');
  });

  it('merchant inputRadius overrides manifest', () => {
    const css = buildTokensCss({ inputRadius: 12 }, 'rose');
    expect(css).toContain('--radius-input: 12px');
  });

  it('merchant sectionPadding overrides manifest', () => {
    const css = buildTokensCss({ sectionPadding: 40 }, 'rose');
    expect(css).toContain('--section-padding: 40px');
    expect(css).toContain('--spacing-section-y: 40px');
  });

  it('merchant logoWidth overrides manifest', () => {
    const css = buildTokensCss({ logoWidth: 200 }, 'rose');
    expect(css).toContain('--size-logo-width: 200px');
  });

  it('merchant headingWeight overrides manifest', () => {
    const css = buildTokensCss({ headingWeight: 700 }, 'rose');
    expect(css).toContain('--weight-heading: 700');
  });

  it('zero buttonRadius from merchant respected (not falsy-coerced)', () => {
    // Important: typeof 0 === 'number' so merchantSet=true; 0 must win.
    const css = buildTokensCss({ buttonRadius: 0 }, 'rose');
    expect(css).toContain('--radius-button: 0px');
  });

  it('partial merchant settings: only set fields override; rest fall back', () => {
    const css = buildTokensCss({ buttonRadius: 24 }, 'rose');
    expect(css).toContain('--radius-button: 24px');
    // cardRadius not touched → manifest default 8px
    expect(css).toContain('--radius-card: 8px');
  });

  it('merchant heroHeadingSize overrides manifest', () => {
    const css = buildTokensCss({ heroHeadingSize: 64 }, 'rose');
    expect(css).toContain('--size-hero-heading: 64px');
  });

  it('manifest --size-hero-heading default used when merchant did not set heroHeadingSize', () => {
    const css = buildTokensCss({}, 'rose');
    // Rose manifest has --size-hero-heading: 40px (фактический h1 верстальщика, themes/rose Hero.astro:43)
    expect(css).toContain('--size-hero-heading: 40px');
  });

  it('merchant navLinkSize overrides manifest', () => {
    const css = buildTokensCss({ navLinkSize: 24 }, 'rose');
    expect(css).toContain('--size-nav-link: 24px');
  });

  it('manifest --size-nav-link default used when merchant did not set navLinkSize', () => {
    const css = buildTokensCss({}, 'rose');
    // Rose manifest has --size-nav-link: 16px
    expect(css).toContain('--size-nav-link: 16px');
  });

  it('Rose manifest --text-transform-heading: uppercase emitted', () => {
    const css = buildTokensCss({}, 'rose');
    expect(css).toContain('--text-transform-heading: uppercase');
  });

  it('non-Rose theme falls back to none for --text-transform-heading', () => {
    const css = buildTokensCss({}, null);
    expect(css).toContain('--text-transform-heading: none');
  });

  it('merchant cartType "page" overrides manifest default drawer', () => {
    const css = buildTokensCss({ cartType: 'page' }, 'rose');
    expect(css).toContain('--cart-type: page');
  });

  it('manifest default --cart-type: drawer used when merchant did not set cartType', () => {
    const css = buildTokensCss({}, 'rose');
    expect(css).toContain('--cart-type: drawer');
  });

  it('invalid cartType ignored → falls back to manifest drawer', () => {
    const css = buildTokensCss({ cartType: 'bogus' }, 'rose');
    expect(css).toContain('--cart-type: drawer');
  });

  it('--cart-type always emitted even without a theme manifest', () => {
    // No theme → no manifest defaults; merchant page choice must still emit.
    const css = buildTokensCss({ cartType: 'page' }, null);
    expect(css).toContain('--cart-type: page');
  });

  it('wishlistEnabled:false → инжектит правило скрытия wishlist UI (все темы)', () => {
    const css = buildTokensCss({ wishlistEnabled: false }, 'rose');
    expect(css).toContain(
      'a[href$="/wishlist"],[data-wishlist-toggle]{display:none !important}',
    );
  });

  it('wishlistEnabled:true / отсутствует → wishlist UI НЕ скрывается', () => {
    expect(buildTokensCss({ wishlistEnabled: true }, 'rose')).not.toContain(
      '[data-wishlist-toggle]{display:none',
    );
    expect(buildTokensCss({}, 'rose')).not.toContain(
      '[data-wishlist-toggle]{display:none',
    );
  });

  it('всегда инжектит sticky-footer правило (все темы, live+preview)', () => {
    const css = buildTokensCss({}, 'rose');
    // body → flex-колонка ≥ вьюпорт; <main> растягивается, толкая футер вниз.
    expect(css).toContain(
      'body:has(footer):not(:has(main main)){min-height:100vh;min-height:100dvh;display:flex;flex-direction:column}',
    );
    expect(css).toContain(
      'body:has(footer):not(:has(main main))>main{flex:1 0 auto}',
    );
  });

  it('sticky-footer правило не зависит от темы (есть и без манифеста)', () => {
    expect(buildTokensCss({}, null)).toContain(
      'body:has(footer):not(:has(main main))>main{flex:1 0 auto}',
    );
  });

  it(':root эмитит button-2 алиасы ≡ secondary (T9)', () => {
    const css = buildTokensCss({}, 'rose');
    // Rose manifest: secondaryButton text=#000000, border=#000000
    // :root должен содержать ОБА алиаса с одинаковым значением
    expect(css).toContain('--color-button-secondary-text: 0 0 0');
    expect(css).toContain('--color-button-2-text: 0 0 0');
    expect(css).toContain('--color-button-secondary-border: 0 0 0');
    expect(css).toContain('--color-button-2-border: 0 0 0');
  });
});

/**
 * Spec 2026-07-06 — «общий отступ темы» = настоящий margin МЕЖДУ секциями,
 * развязанный от per-section padding. Слайдер темы пишет `sectionGap` →
 * токен `--section-gap`; owl-правило `main > * + *` даёт зазор между прямыми
 * детьми <main> (секциями), НЕ трогая header/footer (вне <main>) и НЕ трогая
 * props.padding блоков. Дефолт 0px — нулевая визуальная регрессия.
 */
describe('section gap — margin между секциями', () => {
  it('merchant sectionGap → --section-gap токен', () => {
    const css = buildTokensCss({ sectionGap: 40 }, 'rose');
    expect(css).toContain('--section-gap: 40px');
  });

  it('дефолт --section-gap: 0px когда мерчант не задал (нулевая регрессия)', () => {
    const css = buildTokensCss({}, 'rose');
    expect(css).toContain('--section-gap: 0px');
  });

  it('sectionGap=0 от мерчанта уважается (не falsy-coerce)', () => {
    const css = buildTokensCss({ sectionGap: 0 }, 'rose');
    expect(css).toContain('--section-gap: 0px');
  });

  it('всегда инжектит owl-правило margin между детьми <main> (live+preview)', () => {
    const css = buildTokensCss({ sectionGap: 40 }, 'rose');
    expect(css).toContain('main > * + *{margin-top:var(--section-gap, 0px)}');
  });

  it('owl-правило есть даже без темы и при нулевом зазоре', () => {
    expect(buildTokensCss({}, null)).toContain(
      'main > * + *{margin-top:var(--section-gap, 0px)}',
    );
  });
});

/**
 * Фаза 3 «Цвета» — themeSchemeToMerchantShape экспортируется и конвертирует
 * theme.json-схему (rgb-триплеты) в merchant-hex shape. Использует реальный
 * манифест rose: puck-config API отдаёт именно этот результат конструктору
 * как дефолтные схемы темы (вместо hardcode-палитры ThemeContext).
 */
describe('themeSchemeToMerchantShape (схемы темы → merchant shape)', () => {
  const roseManifest = JSON.parse(
    readFileSync(
      resolve(__dirname, '..', '..', 'packages', 'theme-rose', 'theme.json'),
      'utf-8',
    ),
  );

  it('rose scheme-1 конвертится в белую схему с чёрной primary-кнопкой', () => {
    const scheme1 = roseManifest.colorSchemes.find(
      (s: { id: string }) => s.id === 'scheme-1',
    );
    expect(scheme1).toBeDefined();

    const merchant = themeSchemeToMerchantShape(scheme1);
    expect(merchant).toMatchObject({
      id: 'scheme-1',
      name: '1',
      background: '#ffffff',
      surfaceBg: '#f5f5f5',
      heading: '#000000',
      text: '#000000',
      primaryButton: {
        background: '#000000',
        text: '#ffffff',
        border: '#000000',
      },
      secondaryButton: {
        background: '#ffffff',
        text: '#000000',
        border: '#000000',
      },
    });
  });

  it('все 5 схем rose конвертируются с валидными hex-полями', () => {
    expect(roseManifest.colorSchemes).toHaveLength(5);
    for (const scheme of roseManifest.colorSchemes) {
      const merchant = themeSchemeToMerchantShape(scheme) as {
        id: string;
        background?: string;
        heading?: string;
        primaryButton: { background?: string };
      };
      expect(merchant.id).toBe(scheme.id);
      expect(merchant.background).toMatch(/^#[0-9a-f]{6}$/);
      expect(merchant.heading).toMatch(/^#[0-9a-f]{6}$/);
      expect(merchant.primaryButton.background).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  // Регрессия: :root наследует accent/muted из манифеста темы, когда активная
  // merchant-схема их не несёт (admin ThemeSettings их не редактирует). Без
  // этого :root accent падает в BASE_DEFAULTS (17 17 17) → секции без scheme-
  // обёртки (напр. vanilla Slideshow контрол-бар bg-[rgb(var(--color-accent))])
  // рендерятся чёрными вместо зелёного манифеста (58 69 48).
  it('root inherits accent from theme manifest when active merchant scheme lacks it', () => {
    const css = buildTokensCss(
      {
        defaultSchemeIndex: 0,
        colorSchemes: [
          { id: 'scheme-1', name: 'Dark Olive', background: '#26311c', heading: '#ffffff', text: '#ffffff' },
        ],
      },
      'vanilla',
    );
    // Всё до первого .color-scheme-N — два :root блока (catch-all BASE_DEFAULTS
    // + активная схема). Зелёный accent манифеста должен присутствовать в :root
    // И идти после чёрного BASE_DEFAULT (каскад-победа последнего :root).
    const rootPart = css.slice(0, css.indexOf('.color-scheme-'));
    const idxBaseBlack = rootPart.lastIndexOf('--color-accent: 17 17 17');
    const idxManifestGreen = rootPart.lastIndexOf('--color-accent: 58 69 48');
    expect(idxManifestGreen).toBeGreaterThan(-1);
    expect(idxManifestGreen).toBeGreaterThan(idxBaseBlack);
  });
});
