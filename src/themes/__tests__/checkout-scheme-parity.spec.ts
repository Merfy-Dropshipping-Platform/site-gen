/**
 * ГАРД ПАРИТЕТА b35 (16.09, локальный стенд): превью конструктора обязано
 * красить чекаут ТЕМ ЖЕ значением схемы, что и витрина — на ВСЕХ пяти темах.
 *
 * БАГ (до этого фикса). Секции «Оформление заказа» (CheckoutForm) и «Сводка
 * заказа» (CheckoutSummary) сидировались платформенной константой
 * `colorScheme: 'scheme-2'` (`migrateCheckoutPage`, `revision-migrations.ts`)
 * — предполагая, что вторая схема темы всегда светлая. Неверно: у vanilla
 * заводская Схема 2 тёмно-оливковая (`58 69 48`), у bloom — розовая
 * (`227 142 159`). Мерчант открывал чекаут и видел его перекрашенным в чужую
 * акцентную схему — «тон подложки различается», «схема не применяется к
 * кнопке», «тёмные очертания по периметру» (три жалобы владельца). Класс
 * схемы на колонках чекаута стампует ОДИН generic-механизм — и в превью
 * (`preview.service.ts` per-block wrap), и на витрине (`chrome-assembler.
 * patchCheckoutColumnScheme`, зовётся из `unifyChromeInDist`) — оба читают
 * ОДНО значение `props.colorScheme` из ревизии. Поэтому расхождение было не
 * «превью показывает не то, что витрина», а «сид неверен и превью, и
 * витрину» — бага была ОДНА на оба пути, а не разрыв путей.
 *
 * РЕШЕНИЕ. Снять платформенную числовую константу `scheme-2` с сида/ревизий
 * чекаута и завести СОБСТВЕННУЮ, нечисловую «схему» `scheme-checkout» —
 * фиксированный светлый набор токенов (Figma 1:13398 — чекаут всегда
 * светлый, независимо от схемы темы), общий источник CSS для превью и
 * витрины — `CHECKOUT_SCHEME_CSS` (`tokens-css.ts`, buildTokensCss — тот же
 * генератор, что пишет `src/styles/tokens.css` живой сборки и `<style
 * id="__merfy_tokens_css">` превью).
 *
 * Этот файл — гард паритета: НЕ даёт вернуться (а) литералу `'scheme-2'` в
 * сиде чекаута, (б) литералу `'color-scheme-2'` в legacy-ветке
 * `preview.service.ts`, (в) расхождению CSS `.color-scheme-checkout` между
 * пятью темами (она обязана быть КОНСТАНТОЙ, не завязанной на мерчантскую
 * схему темы).
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { buildTokensCss, CHECKOUT_SCHEME_ID } from '../tokens-css';
import { migrateRevisionData } from '../../utils/revision-migrations';
import {
  checkoutBlockIdentity,
  patchCheckoutColumnScheme,
} from '../chrome-assembler';

const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;
const REPO = resolve(__dirname, '../../..');

/** Настройки темы ровно те, с которыми магазин рождается (тот же путь, что использует checkout-summary-scheme-surface.spec.ts). */
function seedThemeSettings(theme: string): Record<string, unknown> {
  const path = resolve(REPO, 'src/generator/templates/defaults', `${theme}.json`);
  const seed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>;
  return (seed.themeSettings ?? {}) as Record<string, unknown>;
}

function grabRule(css: string, selector: string): string | null {
  const re = new RegExp(
    selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{([^}]*)\\}',
  );
  return re.exec(css)?.[1] ?? null;
}

function varIn(body: string, name: string): string | null {
  return new RegExp(`${name}:\\s*([^;}]+)`).exec(body)?.[1]?.trim() ?? null;
}

// ════════════════════════════════════════════════════════════════════════
// 1. CHECKOUT_SCHEME_CSS — константа, ОДИНАКОВАЯ на всех пяти темах
// ════════════════════════════════════════════════════════════════════════

describe('CHECKOUT_SCHEME_ID / CHECKOUT_SCHEME_CSS — чекаут всегда светлый, независимо от темы', () => {
  it('CHECKOUT_SCHEME_ID = "checkout" (нечисловой id, не пересекается с мерчантскими 1..5)', () => {
    expect(CHECKOUT_SCHEME_ID).toBe('checkout');
  });

  it.each(THEMES)(
    'тема %s: buildTokensCss эмитит .color-scheme-checkout с фиксированными токенами',
    (theme) => {
      const css = buildTokensCss(seedThemeSettings(theme), theme);
      const body = grabRule(css, `.color-scheme-${CHECKOUT_SCHEME_ID}`);
      expect(body).toBeTruthy();
      expect(varIn(body!, '--color-bg')).toBe('255 255 255');
      expect(varIn(body!, '--color-text')).toBe('0 0 0');
      expect(varIn(body!, '--color-heading')).toBe('0 0 0');
      expect(varIn(body!, '--color-surface')).toBe('246 246 247');
      expect(varIn(body!, '--color-muted')).toBe('138 138 138');
    },
  );

  it('ЧИСЛА «ДО/ПОСЛЕ»: .color-scheme-checkout БАЙТ-В-БАЙТ идентична на всех пяти темах (не зависит от мерчантской схемы темы)', () => {
    const bodies = THEMES.map((theme) => {
      const css = buildTokensCss(seedThemeSettings(theme), theme);
      return grabRule(css, `.color-scheme-${CHECKOUT_SCHEME_ID}`);
    });
    const unique = new Set(bodies);
    expect(unique.size).toBe(1);
  });

  it('КОНТРАСТ С БАГОМ: .color-scheme-2 (платформенная константа, на которой сидел баг) РАЗЛИЧАЕТСЯ между темами — vanilla/bloom не светлые', () => {
    const bgByTheme = new Map<string, string | null>();
    for (const theme of THEMES) {
      const css = buildTokensCss(seedThemeSettings(theme), theme);
      const body = grabRule(css, '.color-scheme-2');
      bgByTheme.set(theme, body ? varIn(body, '--color-bg') : null);
    }
    // Замер задачи b35: vanilla заводская Схема 2 тёмно-оливковая (58 69 48),
    // bloom — розовая (227 142 159). Значит один и тот же класс
    // `.color-scheme-2` даёт РАЗНЫЙ --color-bg по темам — вот источник бага,
    // который .color-scheme-checkout больше не воспроизводит.
    const uniqueBg = new Set(bgByTheme.values());
    expect(uniqueBg.size).toBeGreaterThan(1);
    expect(bgByTheme.get('vanilla')).not.toBe('255 255 255');
    expect(bgByTheme.get('bloom')).not.toBe('255 255 255');
  });

  it('--color-input-border на .color-scheme-checkout = "255 255 255" (рамка поля невидима, Точка 3 не регрессирует)', () => {
    for (const theme of THEMES) {
      const css = buildTokensCss(seedThemeSettings(theme), theme);
      const body = grabRule(css, `.color-scheme-${CHECKOUT_SCHEME_ID}`);
      expect(varIn(body!, '--color-input-border')).toBe('255 255 255');
    }
  });

  it('--color-button-* НЕ переопределяется правилом — кнопка/акцент продолжают брать схему магазина по умолчанию (как в живой заплатке bloom)', () => {
    const css = buildTokensCss(seedThemeSettings('bloom'), 'bloom');
    const body = grabRule(css, `.color-scheme-${CHECKOUT_SCHEME_ID}`)!;
    expect(varIn(body, '--color-button-bg')).toBeNull();
    expect(varIn(body, '--color-button-text')).toBeNull();
  });
});

// ════════════════════════════════════════════════════════════════════════
// 2. Сид ревизии — НЕ 'scheme-2'
// ════════════════════════════════════════════════════════════════════════

describe('migrateCheckoutPage — сид больше НЕ ставит платформенную "scheme-2"', () => {
  it('свежий сайт (page-checkout отсутствует): CheckoutForm/CheckoutSummary получают "scheme-checkout"', () => {
    const out = migrateRevisionData({ pagesData: { home: { content: [] } } });
    const pages = out.pagesData as Record<string, any>;
    const content = pages['page-checkout'].content as Array<{ type: string; props: Record<string, unknown> }>;
    const form = content.find((b) => b.type === 'CheckoutForm')!;
    const summary = content.find((b) => b.type === 'CheckoutSummary')!;
    expect(form.props.colorScheme).toBe('scheme-checkout');
    expect(summary.props.colorScheme).toBe('scheme-checkout');
    expect(form.props.colorScheme).not.toBe('scheme-2');
    expect(summary.props.colorScheme).not.toBe('scheme-2');
  });

  it('легаси-коллапс (080 CheckoutLayout → мега-блоки): тоже "scheme-checkout", не "scheme-2"', () => {
    const customCheckout = {
      content: [{ type: 'CheckoutLayout', props: { id: 'X' } }],
    };
    const out = migrateRevisionData({ pagesData: { checkout: customCheckout } });
    const content = (out.pagesData as Record<string, any>).checkout.content as Array<{
      type: string;
      props: Record<string, unknown>;
    }>;
    const form = content.find((b) => b.type === 'CheckoutForm')!;
    const summary = content.find((b) => b.type === 'CheckoutSummary')!;
    expect(form.props.colorScheme).toBe('scheme-checkout');
    expect(summary.props.colorScheme).toBe('scheme-checkout');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 3. Ретроактивный retag — существующие сайты с сидом 'scheme-2'
// ════════════════════════════════════════════════════════════════════════

describe('retagSeededCheckoutScheme — существующие ревизии с сидом "scheme-2" переезжают на "scheme-checkout"', () => {
  it('уже персистнутая ревизия с colorScheme: "scheme-2" на CheckoutForm/CheckoutSummary → "scheme-checkout"', () => {
    const persisted = {
      pagesData: {
        'page-checkout': {
          content: [
            { type: 'CheckoutHeader', props: { id: 'H' } },
            { type: 'CheckoutForm', props: { id: 'F', colorScheme: 'scheme-2' } },
            { type: 'CheckoutSummary', props: { id: 'S', colorScheme: 'scheme-2' } },
            { type: 'Footer', props: { id: 'Ft' } },
          ],
        },
      },
    };
    const out = migrateRevisionData(persisted);
    const content = (out.pagesData as Record<string, any>)['page-checkout'].content as Array<{
      type: string;
      props: Record<string, unknown>;
    }>;
    const form = content.find((b) => b.type === 'CheckoutForm')!;
    const summary = content.find((b) => b.type === 'CheckoutSummary')!;
    expect(form.props.colorScheme).toBe('scheme-checkout');
    expect(summary.props.colorScheme).toBe('scheme-checkout');
  });

  it('осознанный выбор мерчанта (любая схема КРОМЕ 2) НЕ трогается', () => {
    const persisted = {
      pagesData: {
        'page-checkout': {
          content: [
            { type: 'CheckoutForm', props: { id: 'F', colorScheme: 'scheme-4' } },
            { type: 'CheckoutSummary', props: { id: 'S', colorScheme: 'scheme-5' } },
          ],
        },
      },
    };
    const out = migrateRevisionData(persisted);
    const content = (out.pagesData as Record<string, any>)['page-checkout'].content as Array<{
      type: string;
      props: Record<string, unknown>;
    }>;
    expect(content.find((b) => b.type === 'CheckoutForm')!.props.colorScheme).toBe('scheme-4');
    expect(content.find((b) => b.type === 'CheckoutSummary')!.props.colorScheme).toBe('scheme-5');
  });

  it('НЕ трогает "scheme-2" на других страницах/блоках (например, Catalog главной)', () => {
    const persisted = {
      pagesData: {
        home: {
          content: [{ type: 'Catalog', props: { id: 'C', colorScheme: 'scheme-2' } }],
        },
        'page-checkout': {
          content: [{ type: 'CheckoutForm', props: { id: 'F', colorScheme: 'scheme-2' } }],
        },
      },
    };
    const out = migrateRevisionData(persisted);
    const pages = out.pagesData as Record<string, any>;
    expect(pages.home.content[0].props.colorScheme).toBe('scheme-2');
    expect(
      pages['page-checkout'].content.find((b: any) => b.type === 'CheckoutForm').props.colorScheme,
    ).toBe('scheme-checkout');
  });

  it('идемпотентно: второй прогон миграции над уже retag-нутыми данными ничего не меняет', () => {
    const persisted = {
      pagesData: {
        'page-checkout': {
          content: [{ type: 'CheckoutForm', props: { id: 'F', colorScheme: 'scheme-2' } }],
        },
      },
    };
    const once = migrateRevisionData(persisted);
    const twice = migrateRevisionData(once);
    const schemeOnce = (once.pagesData as Record<string, any>)['page-checkout'].content[0].props
      .colorScheme;
    const schemeTwice = (twice.pagesData as Record<string, any>)['page-checkout'].content[0].props
      .colorScheme;
    expect(schemeOnce).toBe('scheme-checkout');
    expect(schemeTwice).toBe('scheme-checkout');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 4. ПАРИТЕТ превью ⇄ витрина — оба пути читают ОДНО значение и стампуют
//    ОДИН и тот же класс
// ════════════════════════════════════════════════════════════════════════

describe('ПАРИТЕТ: превью и витрина стампуют ОДИН класс из ОДНОГО значения ревизии', () => {
  it.each(THEMES)(
    'тема %s: свежий сайт → checkoutBlockIdentity(pagesData, "CheckoutForm"/"CheckoutSummary").scheme === "scheme-checkout"',
    (theme) => {
      const out = migrateRevisionData({ pagesData: { home: { content: [] } } }, theme);
      const pages = out.pagesData as Record<string, unknown>;
      expect(checkoutBlockIdentity(pages, 'CheckoutForm').scheme).toBe('scheme-checkout');
      expect(checkoutBlockIdentity(pages, 'CheckoutSummary').scheme).toBe('scheme-checkout');
    },
  );

  it('patchCheckoutColumnScheme, получив это значение, стампует ИМЕННО .color-scheme-checkout — тот же класс, что красит CHECKOUT_SCHEME_CSS', () => {
    const html =
      '<div class="mfy-checkout-pane mfy-checkout-pane--form" data-checkout-pane="form">FORM</div>' +
      '<div class="mfy-checkout-pane mfy-checkout-pane--summary" data-checkout-pane="summary">SUM</div>';
    const patched = patchCheckoutColumnScheme(
      patchCheckoutColumnScheme(html, 'form', 'scheme-checkout'),
      'summary',
      'scheme-checkout',
    );
    expect(patched).toContain(`color-scheme-${CHECKOUT_SCHEME_ID}`);
    expect(patched.match(/color-scheme-checkout/g)).toHaveLength(2);
    // Старый баг-класс не появляется.
    expect(patched).not.toContain('color-scheme-2"');
  });
});

// ════════════════════════════════════════════════════════════════════════
// 5. Гард источника: preview.service.ts — НЕ литерал 'color-scheme-2'
//    (легаси-ветка renderCheckoutLayout, строки задачи b35: 906-911/957/989/994)
// ════════════════════════════════════════════════════════════════════════

describe('src/services/preview.service.ts — легаси-ветка renderCheckoutLayout не хардкодит color-scheme-2', () => {
  const SRC = resolve(__dirname, '../../services/preview.service.ts');

  it('файл существует и содержит renderCheckoutLayout', () => {
    const raw = readFileSync(SRC, 'utf8');
    expect(raw).toContain('renderCheckoutLayout');
  });

  it('НИ ОДНА строка кода (не комментарий!) не содержит литерал "color-scheme-2"', () => {
    // Ловушка README qa/lib: гард регуляркой обязан вырезать комментарии —
    // сам этот файл и соседние докблоки ОБСУЖДАЮТ снятый литерал (история
    // правки), поэтому наивная проверка красилась бы на собственных
    // комментариях, а не на реальном коде.
    const raw = readFileSync(SRC, 'utf8');
    const withoutBlockComments = raw.replace(/\/\*[\s\S]*?\*\//g, '');
    const withoutLineComments = withoutBlockComments.replace(/(^|[^:])\/\/.*$/gm, '$1');
    expect(withoutLineComments).not.toContain('color-scheme-2');
  });

  it('вместо этого использует CHECKOUT_SCHEME_ID из tokens-css.ts (импортирован и подставлен в шаблонные строки)', () => {
    const raw = readFileSync(SRC, 'utf8');
    expect(raw).toMatch(/import\s*\{[^}]*CHECKOUT_SCHEME_ID[^}]*\}\s*from\s*['"]\.\.\/themes\/tokens-css['"]/);
    expect(raw.match(/color-scheme-\$\{CHECKOUT_SCHEME_ID\}/g)?.length).toBeGreaterThanOrEqual(3);
  });
});
