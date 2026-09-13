/**
 * Хранимая XSS в «Условиях» чекаута.
 *
 * `CheckoutTerms.astro` собирал ссылку из markdown-разметки мерчанта строкой:
 *
 *   const html = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g,
 *     (_m, label, url) => `<a href="${url}" class="…">${label}</a>`);
 *   …
 *   <p set:html={html}></p>
 *
 * Ни `url`, ни `label`, ни остальной текст не проходили санитайзер, а `set:html`
 * вставляет это как разметку. Значит настройка «Текст (поддерживает [текст](url))»
 * — прямой HTML-сток: `[купить](javascript:alert(1))` даёт кликабельный
 * javascript-URL, `[x](" onmouseover="…)` — обработчик на ссылке, а
 * `<img src=x onerror=…>` в самом тексте исполняется без всякой ссылки.
 * Страдает не мерчант, а его покупатель на шаге оплаты.
 *
 * Чиним ТЕМ ЖЕ механизмом, что уже стоит в платформе, а не третьим:
 * allow-list на `sanitize-html` (`packages/theme-base/runtime/rich-text.ts`,
 * рядом с `sanitizeInline`; модель ссылок — `Page.sanitize.ts`). Для голых
 * атрибутов ссылок — `safeHref` из того же модуля и с тем же списком схем.
 *
 * КЛАСС, А НЕ СТРОКА. Аудит блоков чекаута (grep `set:html` и `href={`) дал
 * четыре стока мерчантских значений:
 *   CheckoutTerms.text            → set:html (этот баг);
 *   CheckoutContactForm.authLinkHref → href, поле панели «URL авторизации»;
 *   CheckoutHeader.cartLink/accountLink/backLink → href (в панели скрыты, но
 *       лежат в ревизии);
 *   CheckoutFooterStrip.links[].href → href (собираются из реестра политик).
 * Все четыре закрыты и все четыре здесь проверены.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const SITES_ROOT = join(__dirname, '..', '..', '..');
const RENDERER = resolve(__dirname, 'render-theme-sections.mjs');
const read = (rel: string) => readFileSync(join(SITES_ROOT, rel), 'utf8');

/**
 * Санитайзер тянет `sanitize-html` → `htmlparser2@12`, а тот ESM-only: jest
 * сервиса (CJS) его не грузит. Ровно поэтому уже существующий гард того же
 * класса — `packages/theme-base/blocks/Page/__tests__/Page.sanitize.test.ts` —
 * НЕ ЗАПУСКАЕТСЯ ни одной из конфигураций репозитория (проверено: обе падают
 * на `Cannot use import statement outside a module`). Повторять мёртвый тест
 * смысла нет, поэтому функции гоняем в дочернем node-процессе — и не по
 * исходнику, а по СКОМПИЛИРОВАННОМУ модулю, который реально уезжает в блоки
 * (`dist/astro-blocks/runtime__rich-text.mjs`, его же импортирует
 * CheckoutTerms.mjs). Тот же приём, что у render-theme-sections.mjs.
 */
const RUNTIME_MJS = resolve(SITES_ROOT, 'dist/astro-blocks/runtime__rich-text.mjs');

function callRuntime(fn: string, args: unknown[]): string {
  const script =
    `import { ${fn} } from ${JSON.stringify(pathToFileURL(RUNTIME_MJS).href)};` +
    `process.stdout.write(JSON.stringify(${fn}(...${JSON.stringify(args)})));`;
  return JSON.parse(
    execFileSync('node', ['--input-type=module', '-e', script], {
      cwd: SITES_ROOT,
      encoding: 'utf-8',
      maxBuffer: 8 * 1024 * 1024,
    }),
  ) as string;
}

const safeHref = (value: unknown) => callRuntime('safeHref', [value]);
const sanitizeInlineWithLinks = (value: unknown, linkClass?: string) =>
  callRuntime('sanitizeInlineWithLinks', linkClass === undefined ? [value] : [value, linkClass]);
const sanitizeInline = (value: unknown) => callRuntime('sanitizeInline', [value]);

function renderBaseBlock(block: string, props: Record<string, unknown>): string {
  const jobs = [{ block, pkg: 'theme-base', props }];
  const raw = execFileSync('node', [RENDERER, 'rose', JSON.stringify(jobs)], {
    cwd: SITES_ROOT,
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const rows = JSON.parse(raw) as { html?: string; error?: string }[];
  if (rows[0]?.error) throw new Error(rows[0].error);
  return rows[0]?.html ?? '';
}

const terms = (text: string) =>
  renderBaseBlock('CheckoutTerms', { id: 'CheckoutTerms-1', text, links: [], padding: { top: 0, bottom: 0 } });

// ── 1. Векторы через markdown-ссылку ──────────────────────────────────────

describe('«Условия» чекаута: markdown-ссылка мерчанта', () => {
  it('javascript: в URL не доезжает до разметки', () => {
    const html = terms('Согласен с [условиями](javascript:alert(1))');
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('условиями'); // текст остаётся, ссылка обезврежена
  });

  it('регистр не спасает: JaVaScRiPt: тоже вырезается', () => {
    expect(terms('[x](JaVaScRiPt:alert(1))')).not.toMatch(/javascript:/i);
  });

  it('data:-URL не доезжает', () => {
    const html = terms('[x](data:text/html;base64,PHNjcmlwdD5hbGVydCgxKTwvc2NyaXB0Pg==)');
    expect(html).not.toMatch(/data:text\/html/i);
  });

  it('кавычка в URL не открывает атрибут (on*-хендлер не появляется)', () => {
    const html = terms('[x](" onmouseover="alert(1))');
    // Проверяем НАБОР атрибутов тега, а не подстроку: экранированный `&quot;`
    // оставляет слово onmouseover ВНУТРИ значения href — это безобидный текст,
    // и наивный поиск подстроки красил бы тест зря. Опасно другое — чтобы у
    // тега не появилось лишнего атрибута.
    const tag = /<a\b[^>]*>/.exec(html)?.[0] ?? '';
    expect(tag).not.toBe('');
    // Значения атрибутов выносим ДО сбора имён: внутри href лежит текст
    // `onmouseover=`, и наивный разбор принял бы его за отдельный атрибут.
    const attrs = [...tag.replace(/="[^"]*"/g, '=""').matchAll(/\s([a-zA-Z:_-]+)=/g)].map(
      (m) => m[1],
    );
    expect(attrs.sort()).toEqual(['class', 'href']);
  });

  it('HTML в подписи ссылки не исполняется', () => {
    const html = terms('[<img src=x onerror=alert(1)>](/legal/terms)');
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/<img/i);
  });

  it('честные ссылки живы: относительная, https, mailto', () => {
    const html = terms('[оферта](/legal/terms) [сайт](https://merfy.ru) [почта](mailto:a@b.ru)');
    expect(html).toContain('href="/legal/terms"');
    expect(html).toContain('href="https://merfy.ru"');
    expect(html).toContain('href="mailto:a@b.ru"');
    expect(html).toContain('оферта');
  });

  it('дефолтный текст блока рендерится тремя ссылками, как и раньше', () => {
    const html = terms(
      'Размещая заказ, вы соглашаетесь с [Условиями обслуживания](/legal/terms), ' +
        '[Политикой конфиденциальности](/legal/privacy) и ' +
        '[Политикой использования файлов cookie](/legal/cookies).',
    );
    expect((html.match(/<a\b/g) ?? []).length).toBe(3);
    expect(html).toContain('Размещая заказ');
  });
});

// ── 2. Векторы прямо в тексте (ссылку даже не нужно писать) ────────────────

describe('«Условия» чекаута: сырой HTML в тексте', () => {
  it('<script> вырезается вместе с содержимым', () => {
    const html = terms('ок<script>alert(1)</script>');
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toContain('alert(1)');
  });

  it('<img onerror> вырезается', () => {
    const html = terms('<img src=x onerror="alert(1)">');
    expect(html).not.toMatch(/onerror/i);
    expect(html).not.toMatch(/<img/i);
  });

  it('инлайн-начертания мерчанта остаются (это не XSS)', () => {
    const html = terms('текст <strong>жирный</strong> и <em>курсив</em>');
    expect(html).toContain('<strong>жирный</strong>');
    expect(html).toContain('<em>курсив</em>');
  });
});

// ── 3. Санитайзер как функция: allow-list, а не чёрный список ──────────────

describe('sanitizeInlineWithLinks', () => {
  it('пустое значение — пустая строка (не "undefined")', () => {
    expect(sanitizeInlineWithLinks(undefined)).toBe('');
    expect(sanitizeInlineWithLinks('')).toBe('');
  });

  it('чужие атрибуты ссылки отбрасываются, href остаётся', () => {
    const out = sanitizeInlineWithLinks('<a href="/ok" id="x" style="color:red" onclick="y()">t</a>');
    expect(out).toContain('href="/ok"');
    expect(out).not.toMatch(/onclick|style=|id=/);
  });

  it('target=_blank получает rel=noopener noreferrer', () => {
    const out = sanitizeInlineWithLinks('<a href="https://x.ru" target="_blank">t</a>');
    expect(out).toContain('rel="noopener noreferrer"');
  });

  it('класс ссылки ставит РЕНДЕР, а не мерчант', () => {
    const out = sanitizeInlineWithLinks('<a href="/ok" class="evil">t</a>', 'my-link');
    expect(out).toContain('class="my-link"');
    expect(out).not.toContain('evil');
  });

  it('блочные теги выбрасываются, текст сохраняется', () => {
    expect(sanitizeInlineWithLinks('<div>t</div>')).toBe('t');
  });
});

// ── 4. Голые атрибуты ссылок — тот же список схем ──────────────────────────

describe('safeHref', () => {
  it.each([
    ['javascript:alert(1)'],
    ['JaVaScRiPt:alert(1)'],
    ['  javascript:alert(1)'],
    ['java\tscript:alert(1)'],
    ['java\nscript:alert(1)'],
    ['data:text/html,<script>alert(1)</script>'],
    ['vbscript:msgbox(1)'],
    ['//evil.example'],
  ])('опасное значение %p заменяется на "#"', (value) => {
    expect(safeHref(value)).toBe('#');
  });

  it.each([
    ['/legal/terms'],
    ['/login?next=/checkout'],
    ['https://merfy.ru/a?b=1#c'],
    ['http://merfy.ru'],
    ['mailto:a@b.ru'],
    ['tel:+79990000000'],
    ['#anchor'],
  ])('честное значение %p проходит как есть', (value) => {
    expect(safeHref(value)).toBe(value);
  });

  it('пусто/не строка → "#", а не "undefined" в атрибуте', () => {
    expect(safeHref(undefined)).toBe('#');
    expect(safeHref(null)).toBe('#');
    expect(safeHref('')).toBe('#');
    expect(safeHref('   ')).toBe('#');
    expect(safeHref(42)).toBe('#');
  });

  it('САБОТАЖ: заголовочный sanitizeInline ссылок НЕ разрешает', () => {
    // Иначе «починку» можно было бы сделать расширением sanitizeInline — и
    // заодно открыть <a href> всем заголовкам секций витрины.
    expect(sanitizeInline('<a href="/ok">t</a>')).toBe('t');
  });
});

// ── 5. Остальные ссылочные стоки чекаута ──────────────────────────────────

describe('прочие ссылки чекаута тоже через safeHref', () => {
  it('«URL авторизации» в контактах обезврежен', () => {
    const html = renderBaseBlock('CheckoutContactForm', {
      id: 'CheckoutContactForm-1',
      heading: 'Контакты',
      showAuthLink: true,
      authLinkText: 'Войти',
      authLinkHref: 'javascript:alert(1)',
      emailLabel: 'E-mail',
      phoneLabel: 'Телефон',
      phoneFormat: 'ru',
      padding: { top: 0, bottom: 0 },
    });
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('Войти');
  });

  it('честный «URL авторизации» не ломается', () => {
    const html = renderBaseBlock('CheckoutContactForm', {
      id: 'CheckoutContactForm-1',
      heading: 'Контакты',
      showAuthLink: true,
      authLinkText: 'Войти',
      authLinkHref: '/login?next=/checkout',
      emailLabel: 'E-mail',
      phoneLabel: 'Телефон',
      phoneFormat: 'ru',
      padding: { top: 0, bottom: 0 },
    });
    expect(html).toContain('href="/login?next=/checkout"');
  });

  it('ссылки шапки оформления обезврежены', () => {
    const html = renderBaseBlock('CheckoutHeader', {
      id: 'CheckoutHeader-1',
      siteTitle: 'Магазин',
      logoMode: 'text',
      logoImage: null,
      rightIcon: 'cart',
      accountLink: '/account',
      backLink: '/cart',
      cartLink: 'javascript:alert(1)',
      padding: { top: 24, bottom: 24 },
    });
    expect(html).not.toMatch(/javascript:/i);
  });

  it('правовые ссылки подвала обезврежены', () => {
    const html = renderBaseBlock('CheckoutFooterStrip', {
      siteTitle: 'Магазин',
      links: [
        { label: 'Оферта', href: 'javascript:alert(1)' },
        { label: 'Возврат', href: '/legal/refund' },
      ],
    });
    expect(html).not.toMatch(/javascript:/i);
    expect(html).toContain('href="/legal/refund"');
  });
});

// ── 6. Саботаж: сток обязан оставаться закрытым ────────────────────────────
//
// Рендер-тесты выше покраснеют, если санитайзер снять. Эти две проверки ловят
// более тихий регресс — «вернули строковую сборку ссылки рядом с санитайзером».

describe('САБОТАЖ: сток закрыт в исходнике, а не «на глаз»', () => {
  it('CheckoutTerms не отдаёт в set:html несанитизированное значение', () => {
    const src = read('packages/theme-base/blocks/CheckoutTerms/CheckoutTerms.astro');
    // set:html обязан получать результат санитайзера, а не сырую склейку.
    // Сверяем ИМЕННО присваивание: одного импорта мало — саботаж «оставить
    // import, вернуть склейку» проверку с `toContain` проходил бы насквозь.
    expect(src).toMatch(/set:html=\{html\}/);
    expect(src).toMatch(/const html = sanitizeInlineWithLinks\(/);
  });

  it('ни один блок чекаута не печатает href без safeHref', () => {
    const blocks = [
      'packages/theme-base/blocks/CheckoutContactForm/CheckoutContactForm.astro',
      'packages/theme-base/blocks/CheckoutHeader/CheckoutHeader.astro',
      'packages/theme-base/blocks/CheckoutFooterStrip/CheckoutFooterStrip.astro',
    ];
    for (const rel of blocks) {
      const src = read(rel);
      const hrefs = src.match(/href=\{[^}]*\}/g) ?? [];
      expect(hrefs.length).toBeGreaterThan(0);
      for (const h of hrefs) expect(h).toContain('safeHref');
    }
  });
});
