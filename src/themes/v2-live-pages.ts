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
