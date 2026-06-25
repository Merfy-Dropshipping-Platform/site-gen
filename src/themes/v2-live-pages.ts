import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { PreviewService } from '../services/preview.service';
import { composeV2Page, schemeIdFromProp } from './v2-page-composer';
import { extractPageBlocks } from './page-blocks';
import { isV2ComplexRoute } from './v2-routes';
import { getContentPages, getChromeKind, PRODUCT_UNIFIED_THEMES } from './page-registry';
import { assembleChrome, injectChromeIntoHtml } from './chrome-assembler';
// import type → стирается при компиляции, цикла на module-init не создаёт.
import type { BuildContext } from '../generator/build.service';

const logger = new Logger('V2LivePages');

// Lazy singleton: свой Astro Container для publish-пути (runBuildPipeline —
// функция, не Nest-сервис; DI здесь нет). new PreviewService() даёт дефолтные
// Container factory + v2-резолвер секций (через defaultComponentResolver).
let renderer: PreviewService | null = null;
const getRenderer = (): PreviewService => (renderer ??= new PreviewService());

/**
 * Фаза 2: после copyThemeV2Dist перезаписывает контентные страницы live-диста
 * Container-рендером блоков ревизии (тот же движок, что превью конструктора —
 * live = превью). Контентные страницы включают catalog (098-паритет: каталог
 * нарезается на секции и пересаживается так же, как в превью) и шаблон
 * коллекции collections/preview. Остальные сложные страницы диста
 * (cart/checkout/product/…) не трогаются. Гейт: тема нарезана (есть
 * dist/theme-sections/<тема>/manifest.json), иначе no-op — иначе резолвер
 * v2-секций упадёт в theme-base-каскад и даст ненарезанной теме ЧУЖОЙ вид.
 * Страница без своего шелла в дисте (нет dist/<route>/index.html и нет
 * home-шелла) тихо пропускается.
 * Возвращает число пересаженных страниц.
 */
export async function composeContentPagesIntoDist(
  ctx: BuildContext,
  theme: string,
): Promise<number> {
  if (!(await getRenderer().hasV2Sections(theme))) return 0;

  const revPages = Array.isArray((ctx.revisionData as { pages?: unknown })?.pages)
    ? ((ctx.revisionData as { pages: Array<Record<string, unknown>> }).pages)
    : [];
  const pageName = (key: string): string | undefined => {
    const n = revPages.find((p) => p?.id === key)?.name;
    return typeof n === 'string' ? n : undefined;
  };

  const pages: Array<{
    key: string;
    route: string;
    title?: string;
    collectionContext?: { name?: string; description?: string; image?: string };
    // Системная контентная страница без home-шелл-фоллбэка: если своего
    // шелла в дисте нет — страница тихо пропускается (для collections/preview,
    // у которого на live нет собственного маршрута — его рендерит SSG per-slug).
    requireOwnShell?: boolean;
    // Spec 108: список + флаг requireOwnShell приходят из единого реестра
    // (getContentPages). Каталог/коллекция несут requireOwnShell=true из
    // реестра → пересаживаются ТОЛЬКО поверх собственного шелла диста (никакого
    // home-фоллбэка); прочие контентные страницы — без флага (фоллбэк на home).
  }> = getContentPages().map((p) => ({
    ...p,
    title: pageName(p.key),
  }));

  // Унификация PDP (rose-first): для тем из PRODUCT_UNIFIED_THEMES выделенная
  // страница товара /product рендерится тем же renderBlock-движком, что и
  // контентные секции — настройки секции «Товар» (макет/размер/позиция/зум/
  // схема/отступы/варианты) запекаются в SSR из page-product Product-блока,
  // вместо verbatim-порта темы (RoseProductDetail.astro и аналоги). Свой шелл
  // product/index.html (requireOwnShell) → composeV2Page заменяет тело →
  // applyChromeToDist унифицирует хром (как все non-checkout). Универсальная
  // страница показывает дефолтный товар (productId из конструктора); per-slug
  // /product/<slug> под конкретный товар собирает build.service, переиспользуя
  // этот шелл (renderProductSectionForId). Гейт по theme → нерелевантные темы
  // не затронуты (страница остаётся verbatim).
  if (PRODUCT_UNIFIED_THEMES.has(theme)) {
    pages.push({ key: 'page-product', route: 'product', requireOwnShell: true, title: pageName('page-product') });
  }

  // Кастомные страницы мерчанта — ТОЛЬКО позитивный opt-in. В прод-ревизиях
  // у системных страниц role=null/isCustom=false (а НЕ role='system'), поэтому
  // негативный скип по role затащил бы page-catalog/page-cart/page-checkout
  // в пересадку и затёр сложные страницы диста (включая checkout с shopId).
  const knownRoutes = new Set(pages.map((p) => p.route));
  for (const p of revPages) {
    const isCustom = p?.isCustom === true || p?.role === 'custom';
    if (!isCustom || typeof p?.id !== 'string') continue;
    const slug = String(p.slug ?? '').replace(/^\/+|\/+$/g, '');
    // Ремень: кастомная страница с маршрутом сложной страницы (или дублем
    // контентной) не должна перезаписать страницу диста.
    if (!slug || isV2ComplexRoute(slug) || knownRoutes.has(slug)) continue;
    knownRoutes.add(slug);
    pages.push({
      key: p.id as string,
      route: slug,
      title: typeof p.name === 'string' ? p.name : undefined,
    });
  }

  // Чистый home-шелл читаем ДО цикла: home пересаживается первым, и кастомные
  // страницы должны получить нетронутый дист-шелл, а не уже пересаженный.
  const homeShell = await fs
    .readFile(path.join(ctx.distDir, 'index.html'), 'utf8')
    .catch(() => null);

  let count = 0;
  for (const page of pages) {
    const blocks = await extractPageBlocks(
      ctx.revisionData,
      page.key,
      ctx.publicUrl,
      theme,
      ctx.siteId,
      undefined,
      logger,
      page.collectionContext,
    );
    if (!blocks || blocks.length === 0) continue;
    // Spec 101: «Страница»-секция с привязкой (pageId) к созданной странице —
    // подгружаем (transclude) заголовок+контент целевой страницы в эту секцию
    // при сборке. Пусто = свободный режим (heading/content секции). Изолировано:
    // при сбое/пустом контенте секция остаётся со своими heading/content.
    for (const b of blocks) {
      if (b.type !== 'Page') continue;
      const props = b.props as { pageId?: unknown };
      const boundId = typeof props.pageId === 'string' ? props.pageId.trim() : '';
      if (!boundId || boundId === page.key) continue; // свободный режим / само-ссылка
      try {
        const targetBlocks = await extractPageBlocks(
          ctx.revisionData,
          boundId,
          ctx.publicUrl,
          theme,
          ctx.siteId,
          undefined,
          logger,
          undefined,
        );
        const src = targetBlocks?.find((t) => t.type === 'Page')?.props as
          | { heading?: unknown; content?: unknown }
          | undefined;
        const srcContent = typeof src?.content === 'string' ? src.content : '';
        if (srcContent.trim()) {
          b.props = {
            ...b.props,
            content: srcContent,
            ...(typeof src?.heading === 'string' ? { heading: src.heading } : {}),
          };
        }
      } catch (err) {
        logger.warn(
          `[v2-live] page transclude failed for ${boundId} on ${page.route || '(root)'}: ${(err as Error)?.message ?? String(err)}`,
        );
      }
    }
    const pagePath = path.join(ctx.distDir, page.route, 'index.html');
    // Шелл: собственная страница диста; для кастомных страниц (нет своей в
    // дисте) — чистый home-шелл как источник head/скриптов Layout. Системные
    // страницы с requireOwnShell (catalog/collection) home-шелл НЕ получают:
    // при отсутствии своего шелла диста они тихо пропускаются.
    const ownShell =
      page.route === ''
        ? homeShell
        : await fs.readFile(pagePath, 'utf8').catch(() => null);
    const shellHtml = page.requireOwnShell ? ownShell : (ownShell ?? homeShell);
    if (!shellHtml) continue;
    const blocksHtml = await Promise.all(
      blocks.map((b) =>
        getRenderer().renderBlock({
          blockName: b.type,
          props: { ...b.props, siteId: (b.props as Record<string, unknown>)?.siteId ?? ctx.siteId },
          themeId: theme,
          isPreview: false,
        }),
      ),
    );
    // Системный отказ рендера (контейнер не поднялся и т.п.) даёт '' для ВСЕХ
    // блоков (live-режим рендерит ошибки невидимо) — публиковать пустую
    // страницу нельзя, оставляем страницу диста.
    if (blocksHtml.every((h) => !h.trim())) {
      logger.warn(
        `[v2-live] all blocks rendered empty for ${page.route || '(root)'} — skipping`,
      );
      continue;
    }
    const html = composeV2Page({
      shellHtml,
      blocksHtml,
      blockTypes: blocks.map((b) => b.type),
      blockSchemes: await Promise.all(blocks.map((b) => getRenderer().resolveBlockScheme(b.type, b.props as Record<string, unknown>, theme))),
      // null = live (корневые URL, без /__theme/ префикса).
      assetPrefix: null,
      // Зеркало превью: имя страницы мерчанта → <title> (для кастомных
      // страниц шелл = home, его title без override был бы дублем главной).
      titleOverride: page.title,
    });
    if (html === null) {
      logger.warn(
        `[v2-live] shell not recognized for ${page.route || '(root)'} — page left as theme default`,
      );
      continue;
    }
    await fs.mkdir(path.dirname(pagePath), { recursive: true });
    await fs.writeFile(pagePath, html, 'utf8');
    count++;
  }
  return count;
}

/**
 * Рендер секции «Товар» (theme-base блок Product) под КОНКРЕТНЫЙ productId —
 * для per-slug страницы /product/<slug> (унификация PDP, см. PRODUCT_UNIFIED_THEMES).
 * Возвращает scheme-обёрнутый HTML секции (как делает composeV2Page) для
 * подстановки в <main> уже-собранного универсального product-шелла (хром,
 * глобалы, head/скрипты Layout сохраняются — заменяется только тело <main>).
 * productId прокидывается через extractPageBlocks(productIdOverride) → Product.astro
 * на SSR резолвит реальный товар (storefront-data). null при сбое/пустом
 * рендере → зовущий оставит копию универсальной страницы (graceful).
 */
export async function renderProductSectionForId(
  ctx: BuildContext,
  theme: string,
  productId: string,
): Promise<string | null> {
  try {
    const blocks = await extractPageBlocks(
      ctx.revisionData,
      'page-product',
      ctx.publicUrl,
      theme,
      ctx.siteId,
      productId,
      logger,
      undefined,
    );
    const prod = blocks?.find((b) => b.type === 'Product');
    if (!prod) return null;
    const html = await getRenderer().renderBlock({
      blockName: 'Product',
      props: { ...prod.props, siteId: (prod.props as Record<string, unknown>)?.siteId ?? ctx.siteId },
      themeId: theme,
      isPreview: false,
    });
    if (!html || !html.trim()) return null;
    const scheme = schemeIdFromProp((prod.props as Record<string, unknown>)?.colorScheme);
    return scheme
      ? `<div class="color-scheme-${scheme}" data-block-scheme="${scheme}">${html}</div>`
      : html;
  } catch (err) {
    logger.warn(
      `[v2-live] renderProductSectionForId(${productId}) failed: ${(err as Error)?.message ?? String(err)}`,
    );
    return null;
  }
}

// Политика (site_policy.type) → live-маршрут /legal/<slug> и заголовок.
const POLICY_SLUG_MAP: Record<string, string> = {
  refund: 'refund',
  privacy: 'privacy',
  tos: 'terms',
  shipping: 'shipping-policy',
};
const POLICY_TITLE_MAP: Record<string, string> = {
  refund: 'Политика возврата',
  privacy: 'Политика конфиденциальности',
  tos: 'Условия обслуживания',
  shipping: 'Политика доставки',
};
const policyTextToHtml = (text: string): string =>
  text
    .trim()
    .split(/\n{2,}/)
    .map(
      (para) =>
        `<p>${para
          .replace(/&/g, '&amp;')
          .replace(/</g, '&lt;')
          .replace(/>/g, '&gt;')
          .replace(/\n/g, '<br>')}</p>`,
    )
    .join('');

/**
 * Spec 101: per-site генерация legal-страниц через блок «Страница» (Page) с
 * живым контентом мерчанта из site_policy. Заменяет статичный плейсхолдер темы
 * (themes/<t>/src/data/legal.ts) реальным текстом политик. Шапка/подвал берутся
 * из home-блоков ревизии (как у content-страниц). Изолировано: при любом сбое
 * (Page не резолвится / пустой рендер) страница тихо остаётся как в дисте темы.
 * Вызывать ПОСЛЕ composeContentPagesIntoDist и ДО unifyChromeInDist (чтобы
 * legal-страницы тоже прошли унификацию шапки). Возвращает число страниц.
 */
export async function composeLegalPagesIntoDist(
  ctx: BuildContext,
  theme: string,
  policies: Array<{ type: string; content: string | null }>,
): Promise<number> {
  if (!(await getRenderer().hasV2Sections(theme))) return 0;
  if (!Array.isArray(policies) || policies.length === 0) return 0;

  // Шапка/подвал из home-ревизии (рамка для каждой legal-страницы).
  const homeBlocks = await extractPageBlocks(
    ctx.revisionData,
    'home',
    ctx.publicUrl,
    theme,
    ctx.siteId,
    undefined,
    logger,
    undefined,
  ).catch(() => null);
  const promo = homeBlocks?.find((b) => b.type === 'PromoBanner');
  const header = homeBlocks?.find((b) => b.type === 'Header');
  const footer = homeBlocks?.find((b) => b.type === 'Footer');

  const homeShell = await fs
    .readFile(path.join(ctx.distDir, 'index.html'), 'utf8')
    .catch(() => null);

  let count = 0;
  for (const policy of policies) {
    if (!policy?.content || !policy.content.trim()) continue;
    const slug = POLICY_SLUG_MAP[policy.type] ?? policy.type;
    const route = `legal/${slug}`;
    const pagePath = path.join(ctx.distDir, route, 'index.html');
    // Собственный шелл legal-страницы темы (head/скрипты) либо home-шелл.
    const ownShell = await fs.readFile(pagePath, 'utf8').catch(() => null);
    const shellHtml = ownShell ?? homeShell;
    if (!shellHtml) continue;

    const title = POLICY_TITLE_MAP[policy.type] ?? policy.type;
    const pageBlock = {
      type: 'Page',
      props: {
        heading: title,
        content: policyTextToHtml(policy.content),
        headingSize: 'large',
        colorScheme: 'scheme-1',
        padding: { top: 80, bottom: 80 },
      } as Record<string, unknown>,
    };
    const blocks = [promo, header, pageBlock, footer].filter(
      (b): b is { type: string; props: Record<string, unknown> } => Boolean(b),
    );

    const blocksHtml = await Promise.all(
      blocks.map((b) =>
        getRenderer().renderBlock({
          blockName: b.type,
          props: { ...b.props, siteId: (b.props as Record<string, unknown>)?.siteId ?? ctx.siteId },
          themeId: theme,
          isPreview: false,
        }),
      ),
    );
    // Page-блок отрендерился пустым (не зарезолвился) → не трогаем страницу.
    const pageIdx = blocks.findIndex((b) => b.type === 'Page');
    if (pageIdx === -1 || !blocksHtml[pageIdx]?.trim()) continue;

    const html = composeV2Page({
      shellHtml,
      blocksHtml,
      blockTypes: blocks.map((b) => b.type),
      blockSchemes: await Promise.all(
        blocks.map((b) =>
          getRenderer().resolveBlockScheme(b.type, b.props, theme),
        ),
      ),
      assetPrefix: null,
      titleOverride: title,
    });
    if (html === null) continue;
    await fs.mkdir(path.dirname(pagePath), { recursive: true });
    await fs.writeFile(pagePath, html, 'utf8');
    count++;
  }
  return count;
}

// ── Chrome unification ──────────────────────────────────────────────────────
// Одиночный storefront-<header> темы (несёт data-nt="<тема>-header"). Sticky-
// обёртка и фон — СНАРУЖИ этого элемента и едины на всех страницах, поэтому
// подменяем только внутренний <header>. Цвета шапки идут через --color-* с
// фолбэками, отдельная color-scheme-обёртка ей не нужна.
const HEADER_NT_RE =
  /<header\b[^>]*\bdata-nt=["'][^"']*-header["'][^>]*>[\s\S]*?<\/header>/i;
// Минимальная checkout-шапка темы (CheckoutHeader.astro несёт data-checkout-slot="header").
const HEADER_CHECKOUT_RE =
  /<header\b[^>]*\bdata-checkout-slot=["']header["'][^>]*>[\s\S]*?<\/header>/i;

async function listIndexHtmlFiles(dir: string): Promise<string[]> {
  const out: string[] = [];
  const walk = async (d: string): Promise<void> => {
    const entries = await fs
      .readdir(d, { withFileTypes: true })
      .catch(() => [] as Array<{ name: string; isDirectory(): boolean; isFile(): boolean }>);
    for (const e of entries) {
      const full = path.join(d, e.name);
      if (e.isDirectory()) await walk(full);
      else if (e.isFile() && e.name === 'index.html') out.push(full);
    }
  };
  await walk(dir);
  return out;
}

const distRoute = (distDir: string, file: string): string =>
  path.relative(distDir, path.dirname(file)).split(path.sep).join('/');

const findBlockProps = (
  page: unknown,
  type: string,
): Record<string, unknown> | undefined => {
  const content = (page as { content?: Array<{ type?: string; props?: Record<string, unknown> }> })
    ?.content;
  const block = Array.isArray(content) ? content.find((b) => b?.type === type) : undefined;
  return block?.props;
};

/**
 * Spec 108 (US2/T011) — единый хром НЕ-checkout страниц live-диста.
 *
 * Сложные страницы (product/cart) копируются verbatim из SSG, где `<Header/>`/
 * `<Footer/>` рендерятся БЕЗ пропсов мерчанта → дефолтный siteTitle темы;
 * about/contacts могут сидеться пустой шапкой. Итог: брендинг/меню расходятся.
 *
 * Раньше это правил источниковый код `unifyChromeInDist` (regex-канон шапки из
 * dist/index.html). Теперь источник хрома — общий `assembleChrome` (тот же
 * renderBlock с пропсами мерчанта, что превью и контентные страницы), а
 * применение — идемпотентный `injectChromeIntoHtml`. Это даёт паритет
 * превью↔live: шапка/подвал verbatim-страницы == мерчантский хром (как на home).
 *
 * Обрабатываются ВСЕ index.html, кроме home (`getChromeKind('')==='none'` —
 * источник канона, не трогаем) и checkout (`'checkout'` — его CheckoutHeader
 * правит `unifyChromeInDist`, не трогаем здесь; checkout на React, унификация
 * его хрома вне 108). Footer подменяется только там, где он есть (last
 * `</footer>`); home-Footer пропсы — источник (как было: канон с home).
 *
 * Запускать ПОСЛЕ composeContentPagesIntoDist (нужен собранный home-шелл-источник
 * пропсов в ревизии) и ДО per-slug генерации product (копии унаследуют шапку).
 * Возвращает число изменённых non-checkout страниц.
 */
export async function applyChromeToDist(
  ctx: BuildContext,
  theme: string,
): Promise<{ header: number }> {
  let header = 0;

  // Единый источник хрома: header/footer из блоков ревизии (home-Header/Footer
  // props) через общий renderBlock — ОДИН раз на дист (как канон-шапка раньше).
  const pagesData =
    (ctx.revisionData as { pagesData?: Record<string, unknown> } | null)
      ?.pagesData ?? {};
  const chrome = await assembleChrome({
    pagesData,
    theme,
    chrome: 'full',
    // Bound: модуль chrome-assembler не создаёт свой Container — переиспользует
    // общий getRenderer() (как контентные страницы live-цикла).
    renderBlock: (input) => getRenderer().renderBlock(input),
    isPreview: false,
  });
  if (!chrome.headerHtml) {
    logger.warn(
      '[v2-chrome] assembleChrome gave no canonical header — non-checkout header unify skipped',
    );
  }

  for (const file of await listIndexHtmlFiles(ctx.distDir)) {
    const route = distRoute(ctx.distDir, file);
    // home — источник канона; checkout — отдельный путь (unifyChromeInDist).
    if (getChromeKind(route) !== 'full') continue;
    const html = await fs.readFile(file, 'utf8').catch(() => null);
    if (!html) continue;
    const next = injectChromeIntoHtml(html, chrome);
    if (next !== html) {
      await fs.writeFile(file, next, 'utf8');
      header++;
    }
  }

  return { header };
}

/**
 * Финальная унификация checkout-«шапки» live-диста. ⛔ Spec 108: ТОЛЬКО checkout
 * (non-checkout вынесен в applyChromeToDist). Checkout на React — его хром
 * правится здесь БАЙТ-В-БАЙТ как до 108 (унификация checkout-хрома → 109).
 *
 * На checkout подменяем CheckoutHeader (минимальная шапка по Figma 1:13563) с
 * брендом мерчанта — её CSS присутствует, т.к. тема рендерит её нативно
 * (Layout header="checkout"). Идемпотентно: повторный прогон — no-op.
 *
 * Запускать ПОСЛЕ composeContentPagesIntoDist и ДО per-slug генерации product.
 */
export async function unifyChromeInDist(
  ctx: BuildContext,
  theme: string,
): Promise<{ checkout: number }> {
  let checkout = 0;

  // CheckoutHeader: рендерим с брендом мерчанта (из шапки home), CSS-классы
  // совпадают с нативным рендером темы → стили на месте.
  const pagesData =
    (ctx.revisionData as { pagesData?: Record<string, unknown> } | null)?.pagesData ?? {};
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
  if (typeof homeHeaderProps['siteTitle'] === 'string' && homeHeaderProps['siteTitle']) {
    checkoutProps['siteTitle'] = homeHeaderProps['siteTitle'];
  }
  if (typeof homeHeaderProps['logo'] === 'string' && homeHeaderProps['logo'] && !checkoutProps['logo']) {
    checkoutProps['logo'] = homeHeaderProps['logo'];
  }
  let checkoutHeader: string | null = null;
  try {
    const html = await getRenderer().renderBlock({
      blockName: 'CheckoutHeader',
      props: checkoutProps,
      themeId: theme,
      isPreview: false,
    });
    checkoutHeader = html && html.trim() ? html.trim() : null;
  } catch (err) {
    logger.warn(`[v2-chrome] CheckoutHeader render failed: ${(err as Error)?.message ?? err}`);
  }
  if (!checkoutHeader) {
    logger.warn('[v2-chrome] CheckoutHeader render empty — checkout keeps theme header');
  }

  for (const file of await listIndexHtmlFiles(ctx.distDir)) {
    const route = distRoute(ctx.distDir, file);
    if (route === '') continue; // home — источник канона
    const html = await fs.readFile(file, 'utf8').catch(() => null);
    if (!html) continue;
    const isCheckout = route.split('/')[0] === 'checkout';

    if (isCheckout) {
      if (!checkoutHeader) continue;
      // Тема рендерит CheckoutHeader (data-checkout-slot) внутри своей scheme/
      // token-обёртки — её и подменяем; до раскатки theme-edit fallback на data-nt.
      const re = HEADER_CHECKOUT_RE.test(html)
        ? HEADER_CHECKOUT_RE
        : HEADER_NT_RE.test(html)
          ? HEADER_NT_RE
          : null;
      if (!re) continue;
      if (re.exec(html)?.[0] === checkoutHeader) continue;
      const next = html.replace(re, () => checkoutHeader as string);
      if (next !== html) {
        await fs.writeFile(file, next, 'utf8');
        checkout++;
      }
      continue;
    }
  }

  return { checkout };
}
