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
  /** renderBlock('Footer', props) | null (пусто → не подменять). */
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
    const headerHtml = await renderChromeBlock(
      renderBlock,
      'CheckoutHeader',
      checkoutProps,
      theme,
      isPreview,
    );
    // Checkout без обычного footer (как unifyChromeInDist — footer не трогает).
    return { headerHtml, footerHtml: null };
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
