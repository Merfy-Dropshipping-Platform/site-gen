/**
 * ПОДВАЛА НА ЧЕКАУТЕ НЕТ. Правовая информация страницы оплаты живёт в блоке
 * условий под кнопкой.
 *
 * Владелец, 14.09, три пункта по странице оформления заказа. Пункт 2 — «вот
 * Подвал в чекауте», показано на блок условий («Размещая заказ, вы
 * соглашаетесь с Условиями обслуживания, Политикой конфиденциальности и
 * Политикой использования файлов cookie»). Пункт 3 — «УДАЛИТЬ В ЧЕКАУТЕ»,
 * показано на чёрную полосу «© 2026 Rose. Все права защищены.» под ним.
 * То есть подвалом чекаута владелец считает блок условий, а полосу копирайта
 * убирает.
 *
 * Замер «до» (собранные витрины пяти тем, Chromium, 1440×900, корзина 3
 * позиции, 14.09): полоса копирайта x=0 w=1440 h=80 внизу страницы у КАЖДОЙ
 * из пяти тем; блок условий x=298 w=394 с тремя ссылками /legal/terms,
 * /legal/privacy, /legal/cookies — тоже у каждой. Замер «после»: полосы нет
 * (`<footer>` на странице 0), блок условий и три ссылки на месте.
 *
 * ⚠️ ЦЕНА ВОЗВРАТА, если полосу решат вернуть. Прошлый круг (баг-репорт 18-А)
 * завёл её ровно потому, что до неё внизу чекаута висел ПОДВАЛ ВИТРИНЫ с
 * «Powered by Merfy», и полоса его вытесняла. Снятие подвала витрины никуда не
 * делось — оно переехало в `injectCheckoutChromeIntoHtml` и стало
 * безусловным. Второе последствие честно: полоса умела показывать ссылки из
 * реестра политик магазина (site_policy: refund/privacy/tos/shipping), а блок
 * условий несёт три фиксированные /legal/*. Магазин с заполненными политиками
 * возврата и доставки их на чекауте больше не показывает — это осознанное
 * решение владельца, а не потеря.
 *
 * Саботаж (проверено руками): вернуть `<CheckoutFooterStrip />` в
 * checkout-ветку Layout любой темы, вернуть рендер полосы в `assembleChrome`,
 * заменить безусловное снятие подвала на прежнее «подменить, если собралась» —
 * каждый из трёх шагов обязан покраснеть здесь.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import {
  assembleChrome,
  injectCheckoutChromeIntoHtml,
  type RenderBlockFn,
} from '../chrome-assembler';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');

const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;

function renderBaseBlock(block: string, props: Record<string, unknown>): string {
  const jobs = [{ block, pkg: 'theme-base', props }];
  const raw = execFileSync('node', [RENDERER, 'rose', JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 128 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as { html?: string; error?: string }[];
  if (rows[0]?.error) throw new Error(rows[0].error);
  return rows[0]?.html ?? '';
}

// ── 1. Правовая информация: где она теперь ─────────────────────────────────

describe('подвал чекаута = блок условий (пункт 2 владельца)', () => {
  it('блоки скомпилированы (pnpm build:blocks)', () => {
    expect(existsSync(resolve(SITES_ROOT, 'dist', 'astro-blocks', 'manifest.json'))).toBe(
      true,
    );
  });

  it('«Оформление заказа» несёт блок условий с тремя правовыми ссылками', () => {
    const html = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1' });
    expect(html).toContain('data-checkout-slot="terms"');
    const links = [...html.matchAll(/href="(\/legal\/[a-z-]+)"/g)].map((m) => m[1]);
    expect(links).toEqual(['/legal/terms', '/legal/privacy', '/legal/cookies']);
    // Дословно то, что владелец обвёл как «Подвал в чекауте».
    expect(html).toContain('Размещая заказ, вы соглашаетесь с');
    expect(html).toContain('Условиями обслуживания');
    expect(html).toContain('Политикой конфиденциальности');
    expect(html).toContain('Политикой использования файлов cookie');
  });

  it('блок условий стоит ПОСЛЕ кнопки оплаты, как на скриншоте владельца', () => {
    const html = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1' });
    expect(html.indexOf('data-block="checkout-submit"')).toBeLessThan(
      html.indexOf('data-checkout-slot="terms"'),
    );
  });

  it('САБОТАЖ-калибровка: проверка выше не сторожит пустоту', () => {
    // Если бы ссылок в блоке условий не было, предикат обязан отличать это от
    // «всё хорошо». Текст без ссылок даёт ноль совпадений.
    const html = renderBaseBlock('CheckoutTerms', { text: 'Просто текст без ссылок' });
    expect([...html.matchAll(/href="(\/legal\/[a-z-]+)"/g)]).toHaveLength(0);
  });

  it.each(THEMES)('страница чекаута темы %s собрана из «Оформления заказа»', (theme) => {
    // Блок общий (theme-base), поэтому рендер выше проверяет его один раз.
    // Пер-тематическая часть — что каждая тема этот блок на чекаут ставит:
    // без этого «проверено в пяти темах» было бы враньём.
    expect(read(`themes/${theme}/src/pages/checkout.astro`)).toContain('<CheckoutForm');
  });
});

// ── 2. Полосы копирайта нет ни в одной теме ────────────────────────────────

describe('полоса копирайта снята со страницы (пункт 3 владельца)', () => {
  it.each(THEMES)('тема %s не подключает полосу на чекауте', (theme) => {
    const layout = read(`themes/${theme}/src/layouts/Layout.astro`);
    expect(layout).not.toContain('CheckoutFooterStrip');
    // Подвал витрины остаётся на ОСТАЛЬНЫХ страницах — фильтр не съел лишнего.
    expect(layout).toContain('<Footer />');
    expect(layout).toMatch(/header\s*!==\s*"checkout"\s*&&\s*<Footer\s*\/>/);
  });

  it.each(THEMES)('в checkout-ветке Layout темы %s нет ни одного подвала', (theme) => {
    const layout = read(`themes/${theme}/src/layouts/Layout.astro`);
    // Тернар «не чекаут → Footer, иначе → полоса» был прежней раскладкой;
    // после правки чекаут-ветки нет вовсе.
    expect(layout).not.toMatch(/header\s*!==\s*"checkout"\s*\?/);
  });

  it('сборка хрома чекаута подвал не собирает', async () => {
    const calls: string[] = [];
    const renderBlock: RenderBlockFn = async ({ blockName }) => {
      calls.push(blockName);
      return `<${blockName.toLowerCase()} />`;
    };
    const chrome = await assembleChrome({
      pagesData: {
        home: {
          content: [
            { type: 'Header', props: { siteTitle: 'Мой магазин' } },
            {
              type: 'Footer',
              props: {
                informationColumn: {
                  links: [{ label: 'Политика возврата', href: '/legal/refund' }],
                },
              },
            },
          ],
        },
      },
      theme: 'rose',
      chrome: 'checkout',
      renderBlock,
      isPreview: false,
    });
    expect(calls).toEqual(['CheckoutHeader']);
    expect(calls).not.toContain('CheckoutFooterStrip');
    expect(calls).not.toContain('Footer');
    expect(chrome.footerHtml).toBeNull();
    // Шапка при этом собирается — ветка не «сломана целиком».
    expect(chrome.headerHtml).toBe('<checkoutheader />');
  });

  it('у остальных страниц подвал собирается как раньше (правило не расползлось)', async () => {
    const calls: string[] = [];
    const renderBlock: RenderBlockFn = async ({ blockName }) => {
      calls.push(blockName);
      return `<${blockName.toLowerCase()} />`;
    };
    const chrome = await assembleChrome({
      pagesData: { home: { content: [{ type: 'Footer', props: {} }] } },
      theme: 'rose',
      chrome: 'full',
      renderBlock,
      isPreview: false,
    });
    expect(calls).toContain('Footer');
    expect(chrome.footerHtml).toBe('<footer />');
  });
});

// ── 3. Снятие подвала со СОБРАННОГО шелла — безусловное ────────────────────

/**
 * Три вида шелла встречаются в проде одновременно: свежий (подвала нет),
 * вчерашний (правовая полоса) и старый (подвал витрины, сборка темы старше
 * гейта `header !== "checkout"`). Ни один не должен показать покупателю
 * подвал.
 */
describe('инъекция хрома снимает подвал с любого шелла', () => {
  const NO_CHROME = { headerHtml: null, footerHtml: null };

  const stripShell = () =>
    '<html><body><main>ФОРМА</main>' +
    '<div class="color-scheme-2" style="display:contents;">' +
    '<footer class="w-full color-scheme-2" data-checkout-footer-strip>' +
    '<nav data-checkout-legal-links><a href="/legal/refund">Политика возврата</a></nav>' +
    '<p>© 2026 Магазин. Все права защищены.</p></footer></div></body></html>';

  const storefrontShell = () =>
    '<html><body><main>ФОРМА</main>' +
    '<footer class="w-full" data-nt="rose-footer">' +
    '<ul><li><a href="/catalog">Каталог</a></li></ul>' +
    '<a href="tel:+79000000000">+7 900 000-00-00</a>' +
    '<img src="/icons/pay-mir.svg" alt="МИР" />' +
    '<p>© 2026 Rose Theme. Все права защищены. Powered by Merfy</p>' +
    '</footer></body></html>';

  it('КАЛИБРОВКА: в шеллах действительно есть что снимать', () => {
    expect(stripShell()).toContain('data-checkout-footer-strip');
    expect(storefrontShell()).toContain('Powered by Merfy');
    expect((storefrontShell().match(/<footer\b/g) ?? []).length).toBe(1);
  });

  it('шелл с правовой полосой → полосы нет', () => {
    const out = injectCheckoutChromeIntoHtml(stripShell(), NO_CHROME);
    expect(out).not.toContain('data-checkout-footer-strip');
    expect(out).not.toContain('Все права защищены');
    expect(out).not.toMatch(/<footer\b/);
    expect(out).toContain('<main>ФОРМА</main>');
  });

  it('шелл с подвалом витрины → «Powered by Merfy» не возвращается (баг 18-А)', () => {
    const out = injectCheckoutChromeIntoHtml(storefrontShell(), NO_CHROME);
    expect(out).not.toContain('Powered by');
    expect(out).not.toContain('data-nt="rose-footer"');
    expect(out).not.toMatch(/<ul\b/);
    expect(out).not.toContain('tel:+79000000000');
    expect(out).not.toContain('pay-mir.svg');
    expect(out).not.toMatch(/<footer\b/);
    expect(out).toContain('<main>ФОРМА</main>');
  });

  it('снятие НЕ зависит от того, собрался ли хром (причина возврата 18-А)', () => {
    // Прежний код снимал подвал только вместе с подстановкой полосы:
    // `if (chrome.footerHtml) …`. С footerHtml=null шелл возвращался
    // байт-в-байт, и покупатель видел старый подвал.
    const out = injectCheckoutChromeIntoHtml(storefrontShell(), {
      headerHtml: null,
      footerHtml: null,
    });
    expect(out).not.toEqual(storefrontShell());
    expect(out).not.toMatch(/<footer\b/);
  });

  it('свежий шелл (подвала нет) не ломается и не обрастает подвалом', () => {
    const shell = '<html><body><main>ФОРМА</main></body></html>';
    expect(injectCheckoutChromeIntoHtml(shell, NO_CHROME)).toEqual(shell);
  });

  it('идемпотентно', () => {
    const once = injectCheckoutChromeIntoHtml(storefrontShell(), NO_CHROME);
    expect(injectCheckoutChromeIntoHtml(once, NO_CHROME)).toEqual(once);
  });

  it('снятие живёт в общей функции, а не копией в сборщике витрины', () => {
    const src = read('src/themes/chrome-assembler.ts');
    const fn = src.slice(src.indexOf('export function injectCheckoutChromeIntoHtml'));
    expect(fn).toContain('stripCheckoutFooter');
    // Безусловный вызов: `if (chrome.footerHtml)` перед ним = возврат 18-А.
    expect(fn).not.toMatch(/if \(chrome\.footerHtml\)[^\n]*stripCheckoutFooter/);
    // Живая сборка витрины зовёт ту же функцию, а не свою копию.
    expect(read('src/themes/v2-live-pages.ts')).toContain(
      'injectCheckoutChromeIntoHtml(next, chrome',
    );
  });

  it('чекаут-ветка сборки хрома больше не рендерит полосу', () => {
    const src = read('src/themes/chrome-assembler.ts');
    const branch = src.slice(
      src.indexOf("if (chrome === 'checkout')"),
      src.indexOf("// chrome === 'full'"),
    );
    expect(branch).not.toContain('CheckoutFooterStrip');
    expect(branch).toContain('footerHtml: null');
  });
});
