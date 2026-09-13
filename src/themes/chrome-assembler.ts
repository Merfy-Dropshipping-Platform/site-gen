/**
 * Spec 108 — Единая сборка хрома (шапка/подвал) для всех страниц.
 *
 * Один источник header/footer для контентных И verbatim страниц, в обоих путях
 * (превью и live). Источниковая логика прежнего `unifyChromeInDist`
 * (v2-live-pages.ts:413-506) выносится сюда:
 *   - assembleChrome      — рендерит хром из блоков ревизии с пропсами мерчанта
 *                           (через ИНЪЕКТИРУЕМЫЙ renderBlock — модуль не создаёт
 *                            свой Container, переиспользует общий).
 *   - injectChromeIntoHtml — идемпотентная подмена <header>/<footer> в готовом HTML.
 *
 * Self-contained: собственные копии regex и findBlockProps (модуль не редактирует
 * источники — проводка потребителей отдельная фаза).
 *
 * Foundational-фаза (T005): модуль создан, но ещё нигде не импортируется.
 */

import type { ChromeKind } from './page-registry';

/**
 * Сигнатура инъектируемого рендера блока. Структурно совместима с
 * PreviewService.renderBlock(input: RenderBlockInput): Promise<string>
 * (preview.service.ts:50-65, 278) — передаётся снаружи, чтобы переиспользовать
 * общий Astro Container (как getRenderer() в v2-live-pages).
 */
export type RenderBlockFn = (input: {
  blockName: string;
  props: Record<string, unknown>;
  themeId?: string | null;
  isPreview?: boolean;
}) => Promise<string>;

export interface AssembledChrome {
  /** renderBlock('Header'|'CheckoutHeader', props) | null (пусто → не подменять). */
  headerHtml: string | null;
  /**
   * renderBlock('Footer'|'CheckoutFooterStrip', props) | null (пусто → не
   * подменять). У чекаута это правовая полоса (`CheckoutFooterStrip`), у
   * остальных страниц — обычный подвал магазина.
   */
  footerHtml: string | null;
}

export interface AssembleChromeInput {
  /** ctx.revisionData.pagesData — источник пропсов блоков мерчанта. */
  pagesData: Record<string, unknown>;
  theme: string;
  chrome: ChromeKind;
  /** Инъекция общего рендера (preview.service). */
  renderBlock: RenderBlockFn;
  /** Режим рендера (assetPrefix/stub). Прокидывается в renderBlock. */
  isPreview: boolean;
}

// ── Self-contained копии (источник: v2-live-pages.ts) ───────────────────────

// Одиночный storefront-<header> темы (несёт data-nt="<тема>-header").
// Копия v2-live-pages.ts:363-364 (HEADER_NT_RE) — не редактируем источник.
const HEADER_NT_RE =
  /<header\b[^>]*\bdata-nt=["'][^"']*-header["'][^>]*>[\s\S]*?<\/header>/i;
// Минимальная checkout-шапка темы (CheckoutHeader.astro: data-checkout-slot="header").
// Копия v2-live-pages.ts:366-367 (HEADER_CHECKOUT_RE).
const HEADER_CHECKOUT_RE =
  /<header\b[^>]*\bdata-checkout-slot=["']header["'][^>]*>[\s\S]*?<\/header>/i;

/**
 * Пропсы блока type из content[] страницы ревизии. Копия findBlockProps
 * (v2-live-pages.ts:388-396) — self-contained.
 */
const findBlockProps = (
  page: unknown,
  type: string,
): Record<string, unknown> | undefined => {
  const content = (
    page as {
      content?: Array<{ type?: string; props?: Record<string, unknown> }>;
    }
  )?.content;
  const block = Array.isArray(content)
    ? content.find((b) => b?.type === type)
    : undefined;
  return block?.props;
};

/**
 * Собирает хром из блоков ревизии с пропсами мерчанта. Пропсы и их источники
 * идентичны нынешнему unifyChromeInDist:434-452 (поведение не меняется; меняется
 * только то, что это теперь общий путь и для превью).
 *
 *  - full     → Header (home-Header props) + Footer (home-Footer props)
 *  - checkout → CheckoutHeader (дефолты + page-checkout/checkout props +
 *               siteTitle/logo из home-Header), footer = null
 *  - none     → { null, null }
 *
 * Рендер изолирован: пустой/упавший рендер блока даёт null для этого слота
 * (фолбэк injectChromeIntoHtml — не подменять).
 */
export async function assembleChrome(
  input: AssembleChromeInput,
): Promise<AssembledChrome> {
  const { pagesData, theme, chrome, renderBlock, isPreview } = input;

  if (chrome === 'none') return { headerHtml: null, footerHtml: null };

  if (chrome === 'checkout') {
    // Источник пропсов — точная копия unifyChromeInDist:434-452.
    const homeHeaderProps = findBlockProps(pagesData['home'], 'Header') ?? {};
    const checkoutProps: Record<string, unknown> = {
      siteTitle: 'Мой магазин',
      logoMode: 'text',
      rightIcon: 'cart',
      accountLink: '/account',
      backLink: '/cart',
      cartLink: '/cart',
      padding: { top: 24, bottom: 24 },
      ...(findBlockProps(pagesData['page-checkout'], 'CheckoutHeader') ??
        findBlockProps(pagesData['checkout'], 'CheckoutHeader') ??
        {}),
    };
    if (
      typeof homeHeaderProps['siteTitle'] === 'string' &&
      homeHeaderProps['siteTitle']
    ) {
      checkoutProps['siteTitle'] = homeHeaderProps['siteTitle'];
    }
    // Лого чекаута = лого темы. Build кладёт branding.logoUrl в Header.props.logo
    // (home), а CheckoutHeader.astro рендерит logoMode==='image' && logoImage —
    // маппим сюда, а не в неиспользуемое поле `logo` (иначе logoMode остаётся
    // 'text' → рендерится siteTitle). Всегда зеркалим шапку home.
    if (
      typeof homeHeaderProps['logo'] === 'string' &&
      homeHeaderProps['logo']
    ) {
      checkoutProps['logoMode'] = 'image';
      checkoutProps['logoImage'] = homeHeaderProps['logo'];
    }
    // Подвал чекаута — ПРАВОВОЙ, а не маркетинговый (баг-репорт 18-А: «убрать
    // подвал, где идёт "Powered by merfy"; ожидаемый результат — юридическая
    // информация, ссылки»). Ссылки берём там же, где их берёт обычный подвал:
    // `applyFooterData` кладёт заполненные политики магазина (site_policy:
    // refund/privacy/tos/shipping) в `Footer.props.informationColumn.links`
    // ревизии — и в сборке витрины, и в превью конструктора. Значит чекаут
    // ничего не выдумывает, не ходит в БД отдельно и не может разойтись с
    // подвалом остальных страниц.
    const homeFooterProps = findBlockProps(pagesData['home'], 'Footer') ?? {};
    const infoColumn = homeFooterProps['informationColumn'] as
      | { links?: unknown }
      | undefined;
    const legalLinks = Array.isArray(infoColumn?.links) ? infoColumn.links : [];
    const [headerHtml, footerHtml] = await Promise.all([
      renderChromeBlock(
        renderBlock,
        'CheckoutHeader',
        checkoutProps,
        theme,
        isPreview,
      ),
      renderChromeBlock(
        renderBlock,
        'CheckoutFooterStrip',
        {
          siteTitle: checkoutProps['siteTitle'],
          links: legalLinks,
          // «Цветовая схема» секции «Подвал» страницы чекаута. Контрол в панели
          // есть, а полоса красилась токенами страницы — выбор не делал ничего
          // (п.4 третьего круга: «очень плохо работают цветовые схемы»).
          colorScheme: checkoutFooterScheme(pagesData),
        },
        theme,
        isPreview,
      ),
    ]);
    return { headerHtml, footerHtml };
  }

  // chrome === 'full'
  const headerProps = findBlockProps(pagesData['home'], 'Header') ?? {};
  const footerProps = findBlockProps(pagesData['home'], 'Footer') ?? {};
  const [headerHtml, footerHtml] = await Promise.all([
    renderChromeBlock(renderBlock, 'Header', headerProps, theme, isPreview),
    renderChromeBlock(renderBlock, 'Footer', footerProps, theme, isPreview),
  ]);
  return { headerHtml, footerHtml };
}

/** Рендер слота хрома: пустой/упавший → null (фолбэк = не подменять). */
async function renderChromeBlock(
  renderBlock: RenderBlockFn,
  blockName: string,
  props: Record<string, unknown>,
  theme: string,
  isPreview: boolean,
): Promise<string | null> {
  try {
    const html = await renderBlock({
      blockName,
      props,
      themeId: theme,
      isPreview,
    });
    return html && html.trim() ? html.trim() : null;
  } catch {
    return null;
  }
}

/**
 * Идемпотентная подмена <header>/<footer> в готовом HTML на собранный хром.
 * Повторный прогон с тем же chrome — no-op (как unifyChromeInDist: сравнивает
 * текущий блок с целевым, пишет только при отличии).
 *
 * Header: checkout-slot (HEADER_CHECKOUT_RE) приоритетнее data-nt (HEADER_NT_RE)
 * — зеркало выбора regex в unifyChromeInDist:480-485. Если ни один не найден —
 * не трогаем. Footer: последний <footer>…</footer> (как composeV2Page через
 * lastIndexOf('</footer>')).
 *
 * chrome.headerHtml/footerHtml === null → соответствующий слот не подменяется.
 */
export function injectChromeIntoHtml(
  html: string,
  chrome: AssembledChrome,
): string {
  let out = html;

  if (chrome.headerHtml) {
    const target = chrome.headerHtml;
    const re = HEADER_CHECKOUT_RE.test(out)
      ? HEADER_CHECKOUT_RE
      : HEADER_NT_RE.test(out)
        ? HEADER_NT_RE
        : null;
    if (re) {
      const current = re.exec(out)?.[0];
      // Идемпотентность: уже целевой → не пишем.
      if (current !== target) {
        out = out.replace(re, () => target);
      }
    }
    // Унификация хедера. Пред-собранные verbatim-страницы темы (account/*, login,
    // register, verify, wishlist, legal, blog …) несут ДЕФОЛТНЫЙ хедер-юнит темы,
    // а мерчантский <header> сюда доинъектирован. Мерчантский рендер приносит СВОЙ
    // мобильный бургер-drawer (<div id="<тема>-burger">), но исходный дефолтный
    // остаётся сиблингом → два <div id="X-burger"> с ОДИНАКОВЫМ id → бургер/скрипты
    // хедера (getElementById) цепляются не туда, хедер «работает не как на главной».
    // Оставляем ПЕРВЫЙ бургер (мерчантский, от инъекции), лишние удаляем. Composed-
    // страницы (home/about/cart/catalog/product) собираются заново без дефолтного
    // бургера → ≤1 бургер → no-op. Идемпотентно (повторный прогон → no-op).
    out = dedupeThemeBurgerDrawers(out);
  }

  if (chrome.footerHtml) {
    out = replaceLastFooter(out, chrome.footerHtml);
  }

  return out;
}

/**
 * Удаляет дубликаты мобильного бургер-drawer темы (<div id="<тема>-burger">…),
 * оставляя первый. Балансировка <div>/</div> — точное удаление элемента без
 * захвата соседей (HTML-парсера в проекте нет; regex по вложенным div ненадёжен).
 * ≤1 бургер → без изменений.
 */
function dedupeThemeBurgerDrawers(html: string): string {
  const BURGER_ID = /id="[a-z]+-burger"/gi;
  let out = html;
  // guard = число исходных совпадений (каждая итерация удаляет один) — анти-зацикл.
  let guard = (out.match(BURGER_ID) || []).length;
  while (guard-- > 0) {
    const ids = [...out.matchAll(BURGER_ID)];
    if (ids.length <= 1) break;
    const dup = ids[ids.length - 1]!; // последний = дефолтный (мерчантский идёт первым)
    const divStart = out.lastIndexOf('<div', dup.index);
    if (divStart === -1) break;
    const divEnd = matchingDivEnd(out, divStart);
    if (divEnd === -1) break; // баланс не найден → не трогаем
    out = out.slice(0, divStart) + out.slice(divEnd);
  }
  return out;
}

/**
 * Индекс сразу ПОСЛЕ </div>, закрывающего <div>, начинающийся в startIdx
 * (с учётом вложенности). -1, если баланс не найден.
 */
function matchingDivEnd(html: string, startIdx: number): number {
  const TAG = /<div\b|<\/div>/gi;
  TAG.lastIndex = startIdx;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(html)) !== null) {
    if (m[0][1] === '/') depth--;
    else depth++;
    if (depth === 0) return m.index + m[0].length;
  }
  return -1;
}

/**
 * Подмена последнего <footer …>…</footer> (мирроринг composeV2Page:48 —
 * lastIndexOf('</footer>')). Идемпотентно: если текущий == целевой → no-op.
 */
function replaceLastFooter(html: string, target: string): string {
  const closeIdx = html.lastIndexOf('</footer>');
  if (closeIdx === -1) return html;
  const end = closeIdx + '</footer>'.length;
  // Открывающий <footer ...> ближайший слева от закрывающего тега.
  const openIdx = html.lastIndexOf('<footer', closeIdx);
  if (openIdx === -1) return html;
  const current = html.slice(openIdx, end);
  if (current === target) return html;
  return html.slice(0, openIdx) + target + html.slice(end);
}

/**
 * Figma 1:19998 — применить «Цветовую схему» узла checkout к verbatim-разметке.
 * `checkout.astro` темы рендерит мега-блоки БЕЗ пропсов мерчанта → их
 * `<section data-block="checkout-*">` приходит без класса схемы (наследует
 * палитру страницы). Дописываем `color-scheme-N` в class нужной секции.
 *
 * Цели сейчас ДВЕ, и они не симметричны:
 *   `checkout-summary` — сводка (секция прозрачна, поверхность даёт колонка);
 *   `checkout-submit`  — «Кнопка оплаты» внутри формы. Именно она, а НЕ
 *                        `checkout-form`: уточнение владельца «левая часть от
 *                        нас, там только меняется цвет кнопки и юр инфа цвет».
 *                        Корень формы несёт `bg-[rgb(var(--color-bg))]`, и
 *                        класс на нём красил бы «пятно» под всей формой; корень
 *                        кнопки — `w-full`, он не красит ничего.
 *
 * Идемпотентно: класс не дублируется. `class` идёт ДО `data-block` (порядок
 * атрибутов в CheckoutForm/Summary/Submit.astro).
 *
 * Переехало из `v2-live-pages.ts` (там осталась ре-экспортная ссылка): функция
 * нужна ОБОИМ путям — live-сборке и превью конструктора, а `v2-live-pages`
 * тянет build-зависимости и в превью-контроллер не импортируется.
 */
export function patchCheckoutBlockScheme(
  html: string,
  block: 'checkout-form' | 'checkout-summary' | 'checkout-submit',
  scheme: unknown,
): string {
  const id = schemeIdOf(scheme);
  if (!id) return html;
  const cls = `color-scheme-${id}`;
  const re = new RegExp(
    `(<section\\b[^>]*\\bclass=")([^"]*)("[^>]*\\bdata-block="${block}")`,
  );
  return html.replace(re, (m, p1: string, classes: string, p3: string) =>
    classes.split(/\s+/).includes(cls) ? m : `${p1}${classes} ${cls}${p3}`,
  );
}

/**
 * Значение «Цветовой схемы» → суффикс класса `.color-scheme-N`.
 *
 * Одно значение приезжает тремя видами: панель конструктора шлёт "scheme-2"
 * ИЛИ голую "1" (разные контролы), а живая нормализация ревизии
 * (`coerceGenericLegacyProps`) переводит это в ЧИСЛО. Сверка `typeof === 'string'`
 * молча роняла два вида из трёх: мерчант выбирал схему у «Сводки заказа», а
 * класс с секции ИСЧЕЗАЛ (замер прода 2026-09-13, все пять тем). Зеркало
 * `schemeIdOf` из `themes/<t>/src/lib/color-scheme.ts`.
 */
function schemeIdOf(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value) return value.replace(/^scheme-/, '');
  return '';
}

/**
 * Цветовая схема секции → на КОЛОНКУ чекаута.
 *
 * Эталон владельца (п.4 третьего круга): схема применяется к колонке целиком
 * как к поверхности — сплошной цвет до низа окна и до правого края, текст из
 * той же схемы. До этого класс садился только на `<section>` внутри колонки, а
 * секция сводки ПРОЗРАЧНА (тонирует колонка) — выбор схемы не менял ничего.
 *
 * ТОЛЬКО для `summary`. Левую колонку (`form`) сюда больше не отдают:
 * уточнение владельца после третьего круга — «левая часть от нас… всё
 * остальное наше», её поверхность держит тема. Замер «до» (собранные витрины,
 * пять тем, Chromium, 1440×900, 13-14.09): колонка формы 0..720 заливалась
 * 0,0,0 (rose scheme-4, flux scheme-1), 8,2,0 (satin scheme-4), 207,122,139
 * (bloom scheme-1) — ровно это и снято. Параметр `pane` оставлен: контракт
 * разметки общий, а сужать сигнатуру ради одного вызова — прятать намерение.
 *
 * Колонку ищем по `data-checkout-pane` — общий контракт разметки
 * (packages/theme-base/blocks/CheckoutLayout/checkout-split.ts), один на пять
 * тем и на превью. Идемпотентно: класс не дублируется.
 */
export function patchCheckoutColumnScheme(
  html: string,
  pane: 'form' | 'summary',
  scheme: unknown,
): string {
  const id = schemeIdOf(scheme);
  if (!id) return html;
  const cls = `color-scheme-${id}`;
  const re = new RegExp(
    `(<div\\b[^>]*\\bclass=")([^"]*)("[^>]*\\bdata-checkout-pane="${pane}")`,
  );
  return html.replace(re, (m, p1: string, classes: string, p3: string) =>
    classes.split(/\s+/).includes(cls) ? m : `${p1}${classes} ${cls}${p3}`,
  );
}

/**
 * Баг-репорт 18-В: «Во вкладке Оформление заказа не применяются цветовые схемы
 * к секциям» — повтор 16 по ДРУГОЙ причине.
 *
 * Фикс 16 чинил ПЕРВИЧНЫЙ рендер страницы (класс схемы на секции — он есть,
 * замер прода это подтверждает). Но мерчант крутит настройку без перезагрузки:
 * конструктор шлёт `update-block`, а агент превью ищет секцию строго по
 * `[data-puck-component-id="<id>"]` и этот же атрибут требует от ответа
 * `/preview/block` (`isValidBlockHtml`). Темы рисуют verbatim-чекаут как
 * `<CheckoutForm />` БЕЗ пропсов, поэтому id на мега-блоках не было ни в
 * превью, ни на витрине → `el === null` → «keep old DOM», и правка молча не
 * доезжала (замер 2026-09-13: 5 тем из 5, схема не менялась).
 *
 * Ставим id из ревизии тем же общим кодом, что и схему. Идемпотентно; чужой id
 * (если тема когда-нибудь начнёт проставлять свой) не подменяем.
 */
export function patchCheckoutBlockId(
  html: string,
  block: 'checkout-form' | 'checkout-summary',
  id: unknown,
): string {
  if (typeof id !== 'string' || !id) return html;
  const re = new RegExp(`<section\\b[^>]*\\bdata-block="${block}"`);
  const m = re.exec(html);
  if (!m) return html;
  if (/\bdata-puck-component-id=/.test(m[0])) return html;
  const patched = m[0].replace(
    `data-block="${block}"`,
    `data-puck-component-id="${escapeAttr(id)}" data-block="${block}"`,
  );
  return html.slice(0, m.index) + patched + html.slice(m.index + m[0].length);
}

const escapeAttr = (v: string): string =>
  v.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

/** Что берём из ревизии для секции чекаута: её id и «Цветовая схема». */
export interface CheckoutBlockIdentity {
  /** props.id блока — по нему конструктор находит секцию в превью. */
  id?: unknown;
  /** props.colorScheme блока — «Цветовая схема». */
  scheme?: unknown;
}

/** Секции чекаута из ревизии (блоки страницы page-checkout). */
export interface CheckoutBlockSchemes {
  /** CheckoutForm — «Оформление заказа». */
  form?: CheckoutBlockIdentity;
  /** CheckoutSummary — «Сводка заказа». */
  summary?: CheckoutBlockIdentity;
}

/**
 * Единая доводка verbatim-чекаута: мерчантская шапка + независимые цветовые
 * схемы «Оформление заказа» / «Сводка заказа».
 *
 * Баг-репорт 16: этот набор правок делала ТОЛЬКО live-сборка
 * (`unifyChromeInDist`), а превью конструктора отдавало блоб темы как есть —
 * поэтому во вкладке «Оформление заказа» логотип из настроек темы не
 * подтягивался, а цветовые схемы секций ничего не меняли. Теперь оба пути
 * зовут эту функцию, и превью = live по построению.
 *
 * Обычный подвал страницы не трогаем — у чекаута свой, правовая полоса
 * `CheckoutFooterStrip` (баг-репорт 18-А), и подменяем именно её, а не
 * последний `<footer>` документа. Идемпотентна.
 */
export function injectCheckoutChromeIntoHtml(
  html: string,
  chrome: AssembledChrome,
  blocks: CheckoutBlockSchemes = {},
): string {
  let out = chrome.headerHtml
    ? injectChromeIntoHtml(html, { headerHtml: chrome.headerHtml, footerHtml: null })
    : html;
  // «Цветовая схема» СВОДКИ красит правую КОЛОНКУ целиком (эталон владельца:
  // сплошной цвет до низа окна и до правого края). Класс на секции сводки
  // остаётся — секция прозрачна, вреда нет, а цифры внутри берут из неё
  // --color-*.
  out = patchCheckoutBlockScheme(out, 'checkout-summary', blocks.summary?.scheme);
  out = patchCheckoutColumnScheme(out, 'summary', blocks.summary?.scheme);
  // «Цветовая схема» ФОРМЫ красит ровно ОДИН элемент левой колонки — кнопку
  // оформления. Уточнение владельца (после третьего круга): «левая часть от
  // нас. Там только меняется цвет кнопки и юр инфа цвет. Всё остальное наше».
  // Поэтому ни колонку (`patchCheckoutColumnScheme(…, 'form')`), ни секцию
  // формы (`checkout-form` — её корень несёт `bg-[rgb(var(--color-bg))]` и
  // покрасился бы «пятном») мы схемой больше не трогаем: их фон = фон темы.
  // Второй элемент, правовая полоса, красится своей схемой — секции «Подвал»
  // страницы чекаута (`checkoutFooterScheme` → CheckoutFooterStrip).
  out = patchCheckoutBlockScheme(out, 'checkout-submit', blocks.form?.scheme);
  out = patchCheckoutBlockId(out, 'checkout-form', blocks.form?.id);
  out = patchCheckoutBlockId(out, 'checkout-summary', blocks.summary?.id);
  if (chrome.footerHtml) out = replaceCheckoutFooterStrip(out, chrome.footerHtml);
  return out;
}

/**
 * Подмена правовой полосы чекаута (`<footer data-checkout-footer-strip>`).
 * Обёртку схемы вокруг неё (темы кладут `<div class="color-scheme-2">`) не
 * трогаем. Идемпотентно: совпало с целевым — no-op.
 */
function replaceCheckoutFooterStrip(html: string, target: string): string {
  const re = /<footer\b[^>]*\bdata-checkout-footer-strip[^>]*>[\s\S]*?<\/footer>/i;
  const m = re.exec(html);
  if (!m) return html;
  if (m[0] === target) return html;
  return html.slice(0, m.index) + target + html.slice(m.index + m[0].length);
}

/**
 * Секция чекаута из ревизии: её id и «Цветовая схема». Ключ страницы в
 * pagesData разнится по возрасту сайта (`page-checkout` у конструктора,
 * `checkout` у легаси-витрины) — смотрим оба, как это делал `unifyChromeInDist`.
 *
 * Общая для live и превью: иначе вкладка «Оформление заказа» читала бы схему и
 * id не оттуда, откуда сборка (баг-репорты 16 и 18-В).
 */
export function checkoutBlockIdentity(
  pagesData: Record<string, unknown>,
  blockType: 'CheckoutForm' | 'CheckoutSummary',
): CheckoutBlockIdentity {
  const props = (findBlockProps(pagesData['page-checkout'], blockType) ??
    findBlockProps(pagesData['checkout'], blockType) ??
    {}) as Record<string, unknown>;
  return { id: props['id'], scheme: props['colorScheme'] };
}

/**
 * «Цветовая схема» секции «Подвал» страницы чекаута. Ключ страницы разнится по
 * возрасту сайта (`page-checkout` / `checkout`), поэтому смотрим оба — как и
 * `checkoutBlockIdentity`. Нет своей секции (старый сид) → схема подвала
 * главной, чтобы полоса не выпадала из палитры магазина.
 */
export function checkoutFooterScheme(
  pagesData: Record<string, unknown>,
): unknown {
  const own =
    findBlockProps(pagesData['page-checkout'], 'Footer') ??
    findBlockProps(pagesData['checkout'], 'Footer');
  const props = (own ?? findBlockProps(pagesData['home'], 'Footer') ?? {}) as Record<
    string,
    unknown
  >;
  return props['colorScheme'];
}

/** «Цветовая схема» секции чекаута из ревизии (узкая обёртка над identity). */
export function checkoutBlockScheme(
  pagesData: Record<string, unknown>,
  blockType: 'CheckoutForm' | 'CheckoutSummary',
): unknown {
  return checkoutBlockIdentity(pagesData, blockType).scheme;
}
