import * as fs from 'fs/promises';
import * as path from 'path';
import { Logger } from '@nestjs/common';
import { PreviewService } from '../services/preview.service';
import { composeV2Page } from './v2-page-composer';
import { extractPageBlocks } from './page-blocks';
import { isV2ComplexRoute } from './v2-routes';
// import type → стирается при компиляции, цикла на module-init не создаёт.
import type { BuildContext } from '../generator/build.service';

const logger = new Logger('V2LivePages');

// Lazy singleton: свой Astro Container для publish-пути (runBuildPipeline —
// функция, не Nest-сервис; DI здесь нет). new PreviewService() даёт дефолтные
// Container factory + v2-резолвер секций (через defaultComponentResolver).
let renderer: PreviewService | null = null;
const getRenderer = (): PreviewService => (renderer ??= new PreviewService());

/**
 * Системные контентные страницы: ключ ревизии → live-маршрут.
 *
 * `collectionContext` — опциональный контекст подстановки {{COLLECTION_*}} для
 * страницы-шаблона коллекции (page-collection): на live-шаблоне конкретной
 * коллекции нет, поэтому контекст пустой → дефолты substituteCollectionVars
 * (name='Каталог', description='', image='') как в превью неизвестного slug.
 */
const CONTENT_PAGES: Array<{
  key: string;
  route: string;
  collectionContext?: { name?: string; description?: string; image?: string };
}> = [
  { key: 'home', route: '' },
  { key: 'page-about', route: 'about' },
  { key: 'page-contacts', route: 'contacts' },
  // Платформенный стандарт (spec 100). Темы НЕ несут delivery.astro в
  // пред-собранном дисте → у /delivery нет своего шелла, пересаживается на
  // home-шелл (requireOwnShell=false, как контентная страница about/contacts).
  // Без этой записи page-delivery (role=system, не custom) не пересаживался →
  // /delivery 404 на live (и на новых сайтах тоже).
  { key: 'page-delivery', route: 'delivery' },
  // 098 live-паритет: каталог нарезается на секции и пересаживается в
  // dist/catalog/index.html тем же Container-движком, что превью (live ≡
  // превью). Catalog.astro Container-API-safe, несёт data-puck-component-id +
  // data-catalog-page на корневом <section>.
  { key: 'page-catalog', route: 'catalog' },
  // Шаблон страницы коллекции. На live конкретный slug рендерит Astro SSG
  // (dist/collections/<slug>/index.html, getStaticPaths по collections.json);
  // сюда пересаживается только шаблонный маршрут collections/preview, если у
  // диста есть такой шелл (иначе тихо пропускается — см. ниже). Per-slug
  // пересадка отложена (см. deferred).
  { key: 'page-collection', route: 'collections/preview', collectionContext: {} },
];

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
  }> = CONTENT_PAGES.map((p) => ({
    ...p,
    title: pageName(p.key),
    // Каталог/коллекция пересаживаются ТОЛЬКО поверх собственного шелла диста
    // (никакого home-фоллбэка): иначе при отсутствии маршрута мы бы создали
    // чужую страницу из home-шелла.
    requireOwnShell: p.key === 'page-catalog' || p.key === 'page-collection',
  }));

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
          props: b.props,
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
 * Финальная унификация «шапки» live-диста (зеркало бага «Header разный на
 * страницах»). Сложные страницы (product/cart/checkout) копируются verbatim из
 * SSG, где `<Header/>` рендерится БЕЗ пропсов → дефолтный siteTitle темы;
 * about/contacts могут сидеться пустой шапкой. Итог: брендинг/меню расходятся.
 *
 * Канон = отрендеренная шапка home (dist/index.html, прошла Puck-композицию с
 * пропсами мерчанта). Подменяем внутренний `<header data-nt>` на всех НЕ-checkout
 * страницах. На checkout подменяем CheckoutHeader (минимальная шапка по Figma
 * 1:13563) с брендом мерчанта — её CSS присутствует, т.к. тема рендерит её
 * нативно (Layout header="checkout"). Идемпотентно: повторный прогон — no-op.
 *
 * Запускать ПОСЛЕ composeContentPagesIntoDist (нужен собранный home-шелл) и ДО
 * per-slug генерации product (чтобы копии унаследовали уже исправленную шапку).
 */
export async function unifyChromeInDist(
  ctx: BuildContext,
  theme: string,
): Promise<{ header: number; checkout: number }> {
  let header = 0;
  let checkout = 0;

  const indexHtml = await fs
    .readFile(path.join(ctx.distDir, 'index.html'), 'utf8')
    .catch(() => null);
  const canonicalHeader = indexHtml?.match(HEADER_NT_RE)?.[0] ?? null;
  if (!canonicalHeader) {
    logger.warn(
      '[v2-chrome] no canonical <header data-nt> in home shell — header unify skipped',
    );
  }

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

    if (!canonicalHeader) continue;
    const m = HEADER_NT_RE.exec(html);
    if (!m || m[0] === canonicalHeader) continue;
    const next = html.replace(HEADER_NT_RE, () => canonicalHeader);
    if (next !== html) {
      await fs.writeFile(file, next, 'utf8');
      header++;
    }
  }

  return { header, checkout };
}
