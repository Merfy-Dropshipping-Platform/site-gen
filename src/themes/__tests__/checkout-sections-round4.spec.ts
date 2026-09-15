/**
 * ЧЕТВЁРТЫЙ КРУГ ПО СТРАНИЦЕ «ОФОРМЛЕНИЕ ЗАКАЗА» — пять пунктов владельца
 * (14.09), каждый со своим замером «до».
 *
 * Дословно:
 *   п.1 «секция Подвал не присвоена ни к чему. Ожидаемый результат: присвоить
 *        к юр инфе»;
 *   п.2 «секция Сводка заказа отображается не в полный размер всей правой
 *        части»;
 *   п.3 «секция шапка неправильно отображена. Ожидаемый результат: отделить от
 *        левой и правой части и придать свои размеры»;
 *   п.4 «для секции Сводка заказа применяются только заданые цветовые схемы от
 *        тем, а при измении их не принимает новые условия»;
 *   п.5 «к секции Оформление закаказа не применяется никакая цветовая схема».
 *
 * ЗАМЕР «ДО» — собранные витрины ПЯТИ тем (`themes/<t>/dist/checkout/index.html`)
 * + общая доводка `injectCheckoutChromeIntoHtml` + `buildTokensCss`, Chromium
 * 1440×900, корзина 3 позиции, origin/main ed3d5948:
 *
 *   п.1  «Подвал» (блок Footer страницы чекаута) со схемой scheme-4: цвет
 *        текста юр.инфы НЕ изменился ни в одной теме — rose 18,18,18;
 *        vanilla 255,255,255; flux 153,153,153; satin 18,18,18; bloom 0,0,0
 *        (те же значения, что без схемы). Узел не присвоен ничему.
 *   п.2  колонка сводки x=720 w=720 h≈1276-1298, а СЕКЦИЯ «Сводка заказа»
 *        x=768 w=468 h≈462-464 — карточка 65 % ширины и 36 % высоты колонки,
 *        со сдвигом 48px от левого края колонки и 88px от верха. Все пять тем.
 *   п.3  шапка оформления x=274 w=446 h≈84-86 — ВНУТРИ левой колонки (0..720),
 *        не отделена ни от левой, ни от правой части. Все пять тем.
 *   п.4  мерчант перекрасил схему-4 в панели (Фон #71C0FF, Текст #E91E8C) —
 *        фон колонки сводки НЕ изменился: rose 26,26,26 → 26,26,26;
 *        vanilla 255,255,255 → 255,255,255; flux 26,26,26 → 26,26,26;
 *        satin 8,2,0 → 8,2,0; bloom 247,247,249 → 247,247,249. Ни одно не
 *        равно новому фону 113,192,255. Текст при этом менялся — то есть схема
 *        доезжает, а поверхность берётся из `--color-surface` (поля `surfaceBg`
 *        в редакторе схем НЕТ и не будет: состав настроек — канон). Лечение —
 *        отдельный токен `--color-checkout-surface`, который `buildTokensCss`
 *        считает РОВНО когда мерчант перекрасил «Фон», а поверхность осталась
 *        заводской; схему не трогали — токена нет и вид магазина не меняется.
 *   п.5  выбор схемы-4 у «Оформления заказа» не изменил НИЧЕГО на 4 темах из 5:
 *        кнопка rose 0,0,0→0,0,0; vanilla 255,255,255→255,255,255;
 *        flux 30,41,82→30,41,82; satin 0,0,0→8,2,0 (сдвиг на 8 единиц —
 *        неразличим); только bloom 0,0,0→207,122,139. Колонка, секция и юр.инфа
 *        схемой формы не трогались вовсе.
 *
 * ПОПРАВКА 16.09 (задача b31-checkout, п.4 выше — историческая, поведение
 * заменено). `--color-checkout-surface` снят целиком: владелец прислал
 * скриншот, где Схема 1 (Фон #000000) красит обе колонки РАЗНЫМИ оттенками, и
 * попросил убрать различие — «цвет тот же, схема та же, но они различаются».
 * Правая колонка теперь красится ТЕМ ЖЕ `--color-bg`, что и левая (см.
 * describe ниже и подробный разбор в `checkout-summary-scheme-surface.
 * spec.ts`). Условие «поверхность идёт за перекрашенным Фоном, если её не
 * трогали» и приоритет «уважать осознанно заданную поверхность» — оба сняты:
 * различий быть не должно вообще, откуда бы они ни брались.
 *
 * ЧТО ИЗМЕНИЛОСЬ ПО СУЩЕСТВУ (и почему это не пинг-понг с третьим кругом):
 *
 *   • п.3 отменяет решение третьего круга «шапка внутри левой колонки». Тогда
 *     её туда увели, чтобы над цветной сводкой не висела белая полоса; теперь
 *     владелец просит ровно обратное и показывает эталон, где шапка идёт во всю
 *     ширину над обеими колонками. Полоса перестаёт быть белой потому, что
 *     несёт СВОЮ «Цветовую схему» — контрол, который третий круг обесценил.
 *   • п.5 отменяет сужение «из схемы формы только кнопка». Сужение держалось на
 *     том, что секция «Оформление заказа» была карточкой 394px по центру
 *     колонки, и класс схемы на ней красил «пятно». Это ушло в предыдущем круге
 *     (`checkout-form-fills-column`): секция теперь занимает колонку целиком,
 *     поэтому схема красит КОЛОНКУ — ровно как записано в каноне чекаута
 *     («поверхность от края до края и на всю высоту, а не карточка внутри»).
 *
 * Браузера в CI нет, поэтому гарды стоят на МЕХАНИЗМАХ, которыми эти числа
 * заданы: разрешённый каскад общей таблицы `CHECKOUT_SPLIT_CSS`, контракт
 * разметки `checkoutSplitMarkup`/`CheckoutSplit.astro` и общая доводка
 * `injectCheckoutChromeIntoHtml`. Каждый блок заканчивается САБОТАЖЕМ:
 * возвращаем прежнее поведение дословно и требуем, чтобы предикат покраснел.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join, resolve as resolvePath } from 'node:path';

import {
  CHECKOUT_SPLIT_CSS,
  checkoutSplitMarkup,
} from '../../../packages/theme-base/blocks/CheckoutLayout/checkout-split';
import { parse, resolve } from '../checkout-split-cascade';
import {
  checkoutBlockIdentity,
  injectCheckoutChromeIntoHtml,
} from '../chrome-assembler';
import { buildTokensCss } from '../tokens-css';
import { PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE } from '../../services/preview.service';
import { getThemeManifest, themeToMerchantColorSchemes } from '../theme-manifest-loader';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const RENDERER = resolvePath(__dirname, 'render-theme-sections.mjs');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');
const THEMES = ['rose', 'vanilla', 'bloom', 'satin', 'flux'] as const;

const RULES = parse(CHECKOUT_SPLIT_CSS);

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

/** Страница чекаута ревизии: четыре узла дерева + «Подвал». */
const pagesData = (over: Record<string, Record<string, unknown>> = {}) => ({
  'page-checkout': {
    content: [
      { type: 'CheckoutHeader', props: { id: 'CheckoutHeader-1', ...over.CheckoutHeader } },
      { type: 'CheckoutForm', props: { id: 'CheckoutForm-1', ...over.CheckoutForm } },
      { type: 'CheckoutSummary', props: { id: 'CheckoutSummary-1', ...over.CheckoutSummary } },
      { type: 'Footer', props: { id: 'Footer-1', ...over.Footer } },
    ],
  },
});

/** Общая доводка чекаута над разметкой страницы — как её зовут live и превью. */
function chromed(html: string, over: Record<string, Record<string, unknown>> = {}): string {
  const data = pagesData(over);
  return injectCheckoutChromeIntoHtml(html, { headerHtml: null, footerHtml: null }, {
    form: checkoutBlockIdentity(data, 'CheckoutForm'),
    summary: checkoutBlockIdentity(data, 'CheckoutSummary'),
    footer: checkoutBlockIdentity(data, 'Footer'),
  });
}

/** Класс схемы у секции/колонки, найденной по атрибуту. */
function schemeClassAt(html: string, attr: string): string | null {
  const re = new RegExp(`<(?:section|div|header)\\b[^>]*\\bclass="([^"]*)"[^>]*\\b${attr}`);
  const m = re.exec(html);
  if (!m) return null;
  return m[1].match(/color-scheme-\d+/)?.[0] ?? null;
}

describe('предусловия замера', () => {
  it('блоки скомпилированы (pnpm build:blocks)', () => {
    expect(
      existsSync(resolvePath(SITES_ROOT, 'dist', 'astro-blocks', 'manifest.json')),
    ).toBe(true);
  });

  it('разрешатель каскада читает именно эту таблицу стилей', () => {
    expect(RULES.length).toBeGreaterThan(15);
    expect(RULES.some((r) => r.media === 1)).toBe(true);
  });
});

// ── п.1 «Подвал» присвоен юр.инфе ──────────────────────────────────────────

/** Селектор, по которому доводка адресует блок условий. */
const TERMS_BLOCK = 'checkout-terms';

describe('п.1 узел «Подвал» страницы чекаута управляет юр.инфой', () => {
  it('блок условий адресуем — несёт data-block и слот одновременно', () => {
    const html = renderBaseBlock('CheckoutTerms', { text: 'Условия' });
    expect(html).toContain('data-checkout-slot="terms"');
    expect(html).toContain(`data-block="${TERMS_BLOCK}"`);
  });

  it('«Цветовая схема» Подвала садится на юр.инфу', () => {
    const page = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1' });
    const out = chromed(page, { Footer: { colorScheme: 'scheme-3' } });
    expect(schemeClassAt(out, `data-block="${TERMS_BLOCK}"`)).toBe('color-scheme-3');
  });

  it('id Подвала уезжает на юр.инфу — конструктор находит узел в превью', () => {
    const page = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1' });
    const out = chromed(page, { Footer: { colorScheme: 'scheme-3' } });
    expect(out).toMatch(
      new RegExp(`data-puck-component-id="Footer-1"[^>]*data-block="${TERMS_BLOCK}"`),
    );
  });

  it('схема Подвала НЕ красит форму и не красит колонку', () => {
    const page = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1' });
    const out = chromed(page, { Footer: { colorScheme: 'scheme-3' } });
    expect(schemeClassAt(out, 'data-block="checkout-form"')).toBeNull();
  });

  it('схема не выбрана — класса нет (идемпотентность прежнего поведения)', () => {
    const page = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1' });
    const out = chromed(page, {});
    expect(schemeClassAt(out, `data-block="${TERMS_BLOCK}"`)).toBeNull();
  });

  it('повторный прогон доводки не плодит классы', () => {
    const page = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1' });
    const once = chromed(page, { Footer: { colorScheme: 'scheme-3' } });
    const twice = chromed(once, { Footer: { colorScheme: 'scheme-3' } });
    expect(twice).toBe(once);
  });

  it('правовые ссылки и снятие подвала витрины целы (работа прошлого круга)', () => {
    const page = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1' });
    const out = chromed(`<footer>подвал витрины</footer>${page}`, {
      Footer: { colorScheme: 'scheme-3' },
    });
    expect(out).not.toContain('<footer');
    expect([...out.matchAll(/href="(\/legal\/[a-z-]+)"/g)].map((m) => m[1])).toEqual([
      '/legal/terms',
      '/legal/privacy',
      '/legal/cookies',
    ]);
  });

  it('горячая правка Подвала НЕ подменяет юр.инфу подвалом витрины', () => {
    // По типу узла это `Footer`; если бы агент применил ответ /preview/block,
    // в колонку формы приехал бы подвал витрины с «Powered by Merfy» — баг
    // 18-А через горячую правку. Исполняем НАСТОЯЩЕЕ тело функции агента.
    // Берём ИСПОЛНЯЕМЫЙ текст (экспортируемая строка, которая уходит в кадр),
    // а не текст файла: в файле экранирование шаблонной строки удваивается, и
    // регулярки в извлечённой копии перестают совпадать — на этом замер уже
    // соврал один раз (класс прошлой схемы «не снимался»).
    const factory = new Function(
      `${PREVIEW_CHECKOUT_COLUMN_SCHEME_SOURCE}\nreturn applyCheckoutTermsScheme;`,
    ) as () => (el: unknown, id: string) => unknown;
    const apply = factory();
    const node = {
      className: 'w-full color-scheme-2',
      getAttribute: (n: string) => (n === 'data-block' ? 'checkout-terms' : null),
    };
    expect(apply(node, '3')).toBe(node);
    expect(node.className).toContain('color-scheme-3');
    expect(node.className).not.toContain('color-scheme-2');
    expect(node.className).toContain('w-full');
    // Схему сняли — класс снят, служебные целы.
    apply(node, '');
    expect(node.className).not.toContain('color-scheme-');
    expect(node.className).toContain('w-full');
    // Чужой узел не трогаем — за ним прежняя ветка агента.
    const other = { className: 'x', getAttribute: () => 'checkout-form' };
    expect(apply(other, '3')).toBeNull();
    expect(other.className).toBe('x');
  });

  it('агент вызывает эту ветку ДО подмены разметки', () => {
    const src = read('src/services/preview.service.ts');
    const branch = src.indexOf('if (applyCheckoutTermsScheme(el, newSchemeId)) {');
    const replace = src.indexOf('var checkoutPane = applyCheckoutColumnScheme(el, newSchemeId);');
    expect(branch).toBeGreaterThan(-1);
    expect(branch).toBeLessThan(replace);
  });

  it('САБОТАЖ: блок условий без data-block → схема Подвала никуда не садится', () => {
    const page = renderBaseBlock('CheckoutForm', { id: 'CheckoutForm-1' }).replace(
      ` data-block="${TERMS_BLOCK}"`,
      '',
    );
    const out = chromed(page, { Footer: { colorScheme: 'scheme-3' } });
    expect(schemeClassAt(out, `data-block="${TERMS_BLOCK}"`)).toBeNull();
  });
});

// ── оба пути превью зовут общую доводку ───────────────────────────────────

describe('превью = витрина на ОБОИХ путях рендера чекаута', () => {
  const ctrl = () => read('src/controllers/preview.controller.ts');

  it('блоб-путь (шелл темы) зовёт общую доводку', () => {
    const src = ctrl();
    expect(src).toContain("getChromeKind(route) === 'checkout'");
    expect(src.indexOf('injectCheckoutChromeIntoHtml')).toBeGreaterThan(-1);
  });

  it('путь сборки ИЗ БЛОКОВ зовёт её же', () => {
    // Этот путь работает, когда у темы нет своего шелла чекаута в превью, и
    // раньше доводку не звал вовсе: «Цветовые схемы» колонок в конструкторе не
    // применялись, а узел «Подвал» не находил юр.инфу. Проверяем, что вызов
    // стоит ПОСЛЕ сборки страницы из блоков.
    const src = ctrl();
    const compose = src.indexOf('await this.preview.renderPreviewPage({');
    expect(compose).toBeGreaterThan(-1);
    const after = src.slice(compose);
    expect(after).toContain("getChromeKindByPageId(page) === 'checkout'");
    const call = after.indexOf('injectCheckoutChromeIntoHtml(');
    expect(call).toBeGreaterThan(-1);
    expect(after.slice(call, call + 400)).toContain("checkoutBlockIdentity(pagesData, 'Footer')");
  });

  it('оба пути отдают доводке одну и ту же тройку узлов', () => {
    const src = ctrl();
    const triples = [...src.matchAll(/checkoutBlockIdentity\(pagesData, '(\w+)'\)/g)].map(
      (m) => m[1],
    );
    // Два вызова × три узла: форма, сводка, подвал.
    expect(triples).toEqual([
      'CheckoutForm',
      'CheckoutSummary',
      'Footer',
      'CheckoutForm',
      'CheckoutSummary',
      'Footer',
    ]);
  });
});

// ── п.2 «Сводка заказа» = вся правая колонка ───────────────────────────────

/** Обёртка правой колонки. */
const SUMMARY_INNER = [
  '.mfy-checkout-pane__inner',
  '[data-checkout-pane="summary"] .mfy-checkout-pane__inner',
];
/** Корень секции «Сводка заказа» внутри колонки. */
const SUMMARY_SECTION = ['[data-checkout-pane="summary"] [data-block="checkout-summary"]'];
/** Содержимое секции — оно и держит меру 556/48/40. */
const SUMMARY_CONTENT = ['[data-checkout-pane="summary"] [data-checkout-column="summary"]'];

/** Предикат п.2: обёртка колонки больше не сужает секцию. */
function summaryColumnDoesNotConstrain(css: string): boolean {
  const rules = parse(css);
  return (
    resolve(rules, SUMMARY_INNER, 'max-width', 'desktop') === 'none' &&
    resolve(rules, SUMMARY_INNER, 'padding-left', 'desktop') === '0' &&
    resolve(rules, SUMMARY_INNER, 'padding-right', 'desktop') === '0'
  );
}

describe('п.2 секция «Сводка заказа» занимает всю правую колонку', () => {
  it('десктоп: у обёртки колонки нет своей ширины и боковых отступов', () => {
    expect(resolve(RULES, SUMMARY_INNER, 'max-width', 'desktop')).toBe('none');
    expect(resolve(RULES, SUMMARY_INNER, 'padding-left', 'desktop')).toBe('0');
    expect(resolve(RULES, SUMMARY_INNER, 'padding-right', 'desktop')).toBe('0');
  });

  it('мобилка: то же самое', () => {
    expect(resolve(RULES, SUMMARY_INNER, 'max-width', 'mobile')).toBe('none');
    expect(resolve(RULES, SUMMARY_INNER, 'padding-left', 'mobile')).toBe('0');
    expect(resolve(RULES, SUMMARY_INNER, 'padding-right', 'mobile')).toBe('0');
  });

  it('секция растягивается на всю высоту колонки', () => {
    // Колонка — flex-столбец, секция — растущий элемент: так её высота равна
    // высоте колонки при любом числе позиций (замер «до»: 462 из 1276).
    expect(resolve(RULES, SUMMARY_INNER, 'display', 'desktop')).toBe('flex');
    expect(resolve(RULES, SUMMARY_INNER, 'flex-direction', 'desktop')).toBe('column');
    expect(resolve(RULES, SUMMARY_SECTION, 'flex', 'desktop')).toBe('1 1 auto');
    expect(resolve(RULES, SUMMARY_SECTION, 'width', 'desktop')).toBe('100%');
  });

  it('обёртка колонки не отнимает и вертикаль — секция занимает её целиком', () => {
    expect(resolve(RULES, SUMMARY_INNER, 'padding-top', 'desktop')).toBe('0');
    expect(resolve(RULES, SUMMARY_INNER, 'padding-bottom', 'desktop')).toBe('0');
    expect(resolve(RULES, SUMMARY_INNER, 'padding-top', 'mobile')).toBe('0');
  });

  it('вертикальные отступы 64/32 уехали на содержимое — вместе с липкостью', () => {
    // Они и раньше лежали на ЛИПКОМ элементе (обёртке колонки), поэтому
    // прилипшая сводка стоит там же, где стояла.
    expect(resolve(RULES, SUMMARY_CONTENT, 'padding-top', 'desktop')).toBe('64px');
    expect(resolve(RULES, SUMMARY_CONTENT, 'padding-bottom', 'desktop')).toBe('64px');
    expect(resolve(RULES, SUMMARY_CONTENT, 'padding-top', 'mobile')).toBe('32px');
  });

  it('десктоп: мера переехала на содержимое — прежние 556 + 48/40', () => {
    expect(resolve(RULES, SUMMARY_CONTENT, 'max-width', 'desktop')).toBe('556px');
    expect(resolve(RULES, SUMMARY_CONTENT, 'margin-left', 'desktop')).toBe('0');
    expect(resolve(RULES, SUMMARY_CONTENT, 'margin-right', 'desktop')).toBe('auto');
    expect(resolve(RULES, SUMMARY_CONTENT, 'padding-left', 'desktop')).toBe('48px');
    expect(resolve(RULES, SUMMARY_CONTENT, 'padding-right', 'desktop')).toBe('40px');
    // 556 − 48 − 40 = 468 — ширина содержимого из замера «до» и «после».
    expect(556 - 48 - 40).toBe(468);
  });

  it('мобилка: прежние 540 + 16 у содержимого', () => {
    expect(resolve(RULES, SUMMARY_CONTENT, 'max-width', 'mobile')).toBe('540px');
    expect(resolve(RULES, SUMMARY_CONTENT, 'margin-left', 'mobile')).toBe('auto');
    expect(resolve(RULES, SUMMARY_CONTENT, 'margin-right', 'mobile')).toBe('auto');
    expect(resolve(RULES, SUMMARY_CONTENT, 'padding-left', 'mobile')).toBe('16px');
    expect(resolve(RULES, SUMMARY_CONTENT, 'box-sizing', 'mobile')).toBe('border-box');
  });

  it('липкость (баги 17 и 18-Б) осталась на содержимом колонки', () => {
    expect(resolve(RULES, SUMMARY_CONTENT, 'position', 'desktop')).toBe('sticky');
    expect(resolve(RULES, SUMMARY_CONTENT, 'top', 'desktop')).toBe(
      'var(--checkout-summary-top, 24px)',
    );
    expect(resolve(RULES, SUMMARY_CONTENT, 'position', 'mobile')).toBeUndefined();
  });

  it('содержимое колонки лежит ВНУТРИ секции — иначе секция не колонка', () => {
    const html = renderBaseBlock('CheckoutSummary', { id: 'CheckoutSummary-1' });
    const sec = html.indexOf('data-block="checkout-summary"');
    const inner = html.indexOf('data-checkout-column="summary"');
    expect(sec).toBeGreaterThan(-1);
    expect(inner).toBeGreaterThan(sec);
  });

  it('САБОТАЖ: вернули ширину на обёртку колонки → предикат краснеет', () => {
    // Дословно прежнее правило из main ed3d5948.
    const sabotaged = CHECKOUT_SPLIT_CSS.replace(
      '[data-checkout-pane="summary"] .mfy-checkout-pane__inner { display: flex; flex-direction: column; margin: 0; max-width: none; padding: 0; }',
      '[data-checkout-pane="summary"] .mfy-checkout-pane__inner { margin: 0 auto 0 0; max-width: 556px; padding: 64px 40px 64px 48px; }',
    );
    expect(sabotaged).not.toEqual(CHECKOUT_SPLIT_CSS);
    expect(summaryColumnDoesNotConstrain(sabotaged)).toBe(false);
    expect(summaryColumnDoesNotConstrain(CHECKOUT_SPLIT_CSS)).toBe(true);
  });
});

// ── п.3 «Шапка оформления» — отдельная полоса над колонками ────────────────

/**
 * Разметка без инлайновой таблицы стилей.
 *
 * КАЛИБРОВКА ЗАМЕРА: `checkoutSplitMarkup` начинается с `<style>`, а в CSS
 * встречаются и `[data-checkout-pane=…]`, и `[data-checkout-column=…]`. Первый
 * вариант предиката искал их по всей строке и находил в таблице стилей —
 * «шапка внутри колонки» получалось на ЛЮБОЙ разметке. Отрезаем стили.
 */
function bodyOf(markup: string): string {
  return markup.replace(/<style>[\s\S]*?<\/style>/, '');
}

/** Предикат п.3: шапка не лежит ни в одной из колонок. */
function headerIsOwnStrip(markup: string): boolean {
  const body = bodyOf(markup);
  const strip = body.indexOf('data-checkout-topbar');
  const cols = body.indexOf('data-checkout-cols');
  const firstPane = body.indexOf('data-checkout-pane=');
  return strip > -1 && cols > -1 && strip < cols && strip < firstPane;
}

describe('п.3 шапка отделена от левой и правой части', () => {
  const markup = () => checkoutSplitMarkup('<form-html>', '<summary-html>', '<header-html>');

  it('калибровка: из разметки вырезана таблица стилей', () => {
    // Без этого предикат ловил бы селекторы CSS вместо узлов разметки.
    expect(markup()).toContain('<style>');
    expect(bodyOf(markup())).not.toContain('<style>');
    expect(bodyOf(markup())).toContain('mfy-checkout-split');
  });

  it('полоса шапки стоит НАД строкой колонок', () => {
    expect(headerIsOwnStrip(markup())).toBe(true);
  });

  it('шапка не лежит внутри колонки формы', () => {
    const m = bodyOf(markup());
    const formPane = m.indexOf('data-checkout-pane="form"');
    expect(m.indexOf('<header-html>')).toBeLessThan(formPane);
  });

  it('колонки лежат в своей строке — она и делит экран пополам', () => {
    expect(resolve(RULES, ['.mfy-checkout-cols'], 'flex-direction', 'desktop')).toBe('row');
    expect(resolve(RULES, ['.mfy-checkout-cols'], 'flex-direction', 'mobile')).toBe('column');
    expect(resolve(RULES, ['.mfy-checkout-pane'], 'width', 'desktop')).toBe('50%');
  });

  it('у полосы свои размеры: своя ширина и свои отступы', () => {
    // «придать свои размеры»: полоса во всю ширину, вертикальные отступы берёт
    // из своего параметра «Отступы» (инлайн блока), контейнер — свой.
    expect(resolve(RULES, ['.mfy-checkout-topbar'], 'width', 'desktop')).toBe('100%');
    expect(resolve(RULES, ['.mfy-checkout-topbar'], 'flex', 'desktop')).toBe('none');
  });

  it('палитра шапки больше не отнимается у колонки', () => {
    // Третий круг гасил фон шапки и подменял её цвет переменной колонки —
    // внутри колонки иначе получалось «пятно». Полоса стоит отдельно, поэтому
    // её собственная «Цветовая схема» снова работает.
    expect(CHECKOUT_SPLIT_CSS).not.toContain('--checkout-pane-heading');
    expect(CHECKOUT_SPLIT_CSS).not.toMatch(
      /\[data-checkout-pane\][^{]*\[data-checkout-slot="header"\][^}]*background:\s*transparent/,
    );
  });

  it('размеры логотипа остались общими (не вернулись в пять копий Layout)', () => {
    expect(CHECKOUT_SPLIT_CSS).toContain('--size-checkout-brand');
    expect(CHECKOUT_SPLIT_CSS).toContain('--size-checkout-brand-image');
  });

  it.each(THEMES)('тема %s берёт общий CheckoutSplit, своей копии нет', (theme) => {
    const page = read(`themes/${theme}/src/pages/checkout.astro`);
    expect(page).toContain('CheckoutSplit');
    expect(page).toContain('slot="header"');
    expect(page).not.toContain('mfy-checkout-split');
  });

  it('разметка компонента и разметка превью — один источник', () => {
    const astro = read(
      'packages/theme-base/blocks/CheckoutLayout/CheckoutSplit.astro',
    );
    expect(astro).toContain('data-checkout-topbar');
    expect(astro).toContain('data-checkout-cols');
    expect(read('src/services/preview.service.ts')).toContain('checkoutSplitMarkup');
  });

  it('САБОТАЖ: вернули шапку внутрь колонки → предикат краснеет', () => {
    const sabotaged =
      '<div class="mfy-checkout-split">' +
      '<div class="mfy-checkout-pane" data-checkout-pane="form">' +
      '<div class="mfy-checkout-pane__inner" data-checkout-column="form">' +
      '<header-html><form-html></div></div>' +
      '<div class="mfy-checkout-pane" data-checkout-pane="summary"></div></div>';
    expect(headerIsOwnStrip(sabotaged)).toBe(false);
  });
});

// ── п.4 (16.09: заменено) — сводка красится ТЕМ ЖЕ «Фоном», что и форма ────
//
// Историческое п.4 (14.09/15.09, см. docblock файла) держало отдельный
// токен `--color-checkout-surface` с приоритетом «уважать осознанно заданную
// поверхность → перекрашенный Фон → заводскую поверхность». 16.09 владелец
// это отменил целиком: обе колонки одной схемы обязаны быть НЕРАЗЛИЧИМЫ.

const SUMMARY_PANE = ['[data-checkout-pane="summary"]'];
const FORM_PANE = ['[data-checkout-pane="form"]'];

/**
 * Предикат п.4 (16.09): поверхность правой колонки — тот же `--color-bg`,
 * что красит левую, и никакого отдельного токена поверхности в правиле нет.
 */
function summaryEqualsFormBackground(css: string): boolean {
  const parsed = parse(css);
  const summaryBg = resolve(parsed, SUMMARY_PANE, 'background', 'desktop');
  const formBg = resolve(parsed, FORM_PANE, 'background', 'desktop');
  return (
    typeof summaryBg === 'string' &&
    typeof formBg === 'string' &&
    summaryBg === formBg &&
    !summaryBg.includes('checkout-surface')
  );
}

/** Значение переменной внутри правила `.color-scheme-N` собранного tokens-css. */
function schemeVar(css: string, scheme: string, name: string): string | null {
  const rule = new RegExp(`\\.color-scheme-${scheme}\\s*\\{([^}]*)\\}`).exec(css);
  if (!rule) return null;
  return new RegExp(`${name}:\\s*([^;}]+)`).exec(rule[1])?.[1]?.trim() ?? null;
}

describe('п.4 (16.09) «Сводка заказа» = «Фон» той же схемы, что и форма — без исключений', () => {
  const themeSchemes = (theme: string) => themeToMerchantColorSchemes(theme);
  /** Мерчант перекрасил в панели только «Фон» — других полей там нет. */
  const repainted = (theme: string, id: string, bg: string) =>
    themeSchemes(theme).map((sc) => (sc.id === id ? { ...sc, background: bg } : sc));

  it('CSS-правило колонки читает то же выражение, что и правило формы', () => {
    expect(summaryEqualsFormBackground(CHECKOUT_SPLIT_CSS)).toBe(true);
  });

  it.each(THEMES)('тема %s: схему не трогали — поверхность больше НЕ заводская, а равна «Фону»', (theme) => {
    // ДО 16.09 нетронутая схема сохраняла заводскую поверхность (страховка
    // от «починки, которая перекрасит все магазины» — сид rose пинит
    // scheme-2, и переход на «Фон» действительно меняет вид). ПОСЛЕ 16.09
    // это возражение снято владельцем явно: колонка ВСЕГДА равна «Фону»,
    // даже когда он совпадает с заводским видом (флаг «вид не меняется»
    // был подчинён старому приоритету, которого больше нет).
    const css = buildTokensCss({ colorSchemes: themeSchemes(theme) }, theme);
    const manifest = getThemeManifest(theme);
    let проверено = 0;
    for (const sc of manifest?.colorSchemes ?? []) {
      const id = sc.id.replace(/^scheme-/, '');
      const bg = schemeVar(css, id, '--color-bg');
      expect(bg).toBeTruthy();
      expect(css).not.toContain('--color-checkout-surface');
      проверено++;
    }
    expect(проверено).toBeGreaterThan(0);
  });

  it.each(THEMES)('тема %s: перекрасили «Фон» — колонка идёт за ним (как и раньше, но БЕЗ отдельного токена)', (theme) => {
    const css = buildTokensCss(
      { colorSchemes: repainted(theme, 'scheme-4', '#71C0FF') },
      theme,
    );
    // #71C0FF — тот же контрольный цвет, которым замер «до» 14.09 показывал,
    // что колонка его НЕ принимает (оставалась 26,26,26 / 8,2,0 / 247,247,249
    // / 255,255,255). 16.09: значение читаем напрямую из --color-bg.
    expect(schemeVar(css, '4', '--color-bg')).toBe('113 192 255');
    expect(css).not.toContain('--color-checkout-surface');
  });

  it('перекрашена одна схема — соседние остаются на СВОЁМ «Фоне» (никакой заморозки)', () => {
    const css = buildTokensCss(
      { colorSchemes: repainted('rose', 'scheme-4', '#71C0FF') },
      'rose',
    );
    expect(schemeVar(css, '4', '--color-bg')).toBe('113 192 255');
    // Заводские значения rose из `packages/theme-rose/theme.json`.
    expect(schemeVar(css, '3', '--color-bg')).toBe('245 240 235');
    expect(schemeVar(css, '2', '--color-bg')).toBe('255 255 255');
  });

  it('16.09: мерчант задал свою поверхность (surfaceBg) — БОЛЬШЕ НЕ уважаем, колонка идёт за «Фоном»', () => {
    // ДО 16.09 это был приоритет №1 (тёмный сайдбар корзины и т.п.) — колонка
    // красилась `surfaceBg`, а не «Фоном». Владелец 16.09 отменил исключение
    // целиком: различия быть не должно, откуда бы оно ни бралось.
    const schemes = themeSchemes('rose').map((sc) =>
      sc.id === 'scheme-4'
        ? { ...sc, background: '#71C0FF', surfaceBg: '#102030' }
        : sc,
    );
    const css = buildTokensCss({ colorSchemes: schemes }, 'rose');
    expect(schemeVar(css, '4', '--color-bg')).toBe('113 192 255');
    expect(css).not.toContain('--color-checkout-surface');
  });

  it('САБОТАЖ: вернули отдельный --color-checkout-surface → предикат «одно правило» краснеет', () => {
    const sabotaged = CHECKOUT_SPLIT_CSS.replace(
      '[data-checkout-pane="summary"] { background: rgb(var(--color-bg, 255 255 255)); }',
      '[data-checkout-pane="summary"] { background: rgb(var(--color-checkout-surface, var(--color-surface, 245 245 245))); }',
    );
    expect(sabotaged).not.toEqual(CHECKOUT_SPLIT_CSS);
    expect(summaryEqualsFormBackground(sabotaged)).toBe(false);
  });

  it('САБОТАЖ-калибровка: замер видит и отсутствие правила', () => {
    expect(summaryEqualsFormBackground('')).toBe(false);
  });

  it('САБОТАЖ-КАЛИБРОВКА: правка НЕсторожимого (текст комментария) не трогает предикат', () => {
    const sabotaged = CHECKOUT_SPLIT_CSS.replace(
      'Критерий владельца:',
      'Критерий владельца (правка комментария, к покраске не относится):',
    );
    expect(sabotaged).not.toEqual(CHECKOUT_SPLIT_CSS);
    expect(summaryEqualsFormBackground(sabotaged)).toBe(true);
  });
});

// ── п.5 «Оформление заказа»: схема красит левую колонку ────────────────────

describe('п.5 схема секции «Оформление заказа» видима', () => {
  const pane = (kind: 'form' | 'summary') =>
    `<div class="mfy-checkout-pane mfy-checkout-pane--${kind}" data-checkout-pane="${kind}"></div>`;

  it('доводка красит левую колонку схемой формы', () => {
    const out = chromed(pane('form'), { CheckoutForm: { colorScheme: 'scheme-4' } });
    expect(schemeClassAt(out, 'data-checkout-pane="form"')).toBe('color-scheme-4');
  });

  it('схема формы не выбрана — колонка на палитре темы', () => {
    const out = chromed(pane('form'), {});
    expect(schemeClassAt(out, 'data-checkout-pane="form"')).toBeNull();
  });

  it('схема формы не трогает правую колонку', () => {
    const out = chromed(pane('summary'), { CheckoutForm: { colorScheme: 'scheme-4' } });
    expect(schemeClassAt(out, 'data-checkout-pane="summary"')).toBeNull();
  });

  it('колонка формы красится ФОНОМ схемы (тем же, что правая)', () => {
    const bg = resolve(RULES, ['[data-checkout-pane="form"]'], 'background', 'desktop');
    expect(bg).toContain('--color-bg');
  });

  it('кнопка оплаты по-прежнему берёт цвет схемы формы', () => {
    // Прежнее поведение не отменяем — оно просто перестаёт быть единственным.
    const html = renderBaseBlock('CheckoutForm', {
      id: 'CheckoutForm-1',
      colorScheme: 'scheme-4',
    });
    expect(schemeClassAt(html, 'data-block="checkout-submit"')).toBe('color-scheme-4');
  });

  it('горячая правка в превью красит левую колонку так же', () => {
    const src = read('src/services/preview.service.ts');
    const fn = /function applyCheckoutColumnScheme[\s\S]*?\n\}/.exec(src)?.[0] ?? '';
    expect(fn).not.toContain("=== 'summary'");
  });

  it('САБОТАЖ: убрали покраску левой колонки → предикат краснеет', () => {
    const out = chromed(pane('form'), { CheckoutForm: { colorScheme: 'scheme-4' } });
    const sabotaged = out.replace(/\s*color-scheme-4/, '');
    expect(sabotaged).not.toEqual(out);
    expect(schemeClassAt(sabotaged, 'data-checkout-pane="form"')).toBeNull();
  });
});
