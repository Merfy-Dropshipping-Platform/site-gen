#!/usr/bin/env node
/**
 * Дочерний рендерер секций темы для снимков HTML.
 *
 * jest (CJS, без --experimental-vm-modules) не умеет загружать скомпилированные
 * ESM-модули секций и рантайм astro в своём процессе, поэтому spec запускает
 * этот скрипт. Рендерим РОВНО тот модуль, который тема отдаёт на витрину и в
 * превью (dist/theme-sections/<тема>/manifest.json), а не исходный текст и не
 * theme-base.
 *
 * Использование: node render-theme-sections.mjs <тема> '<[{block, props}, …]>'
 * На stdout — JSON-массив { block, html } (или { block, error }).
 *
 * job.pkg === 'theme-base' — рендерить ОБЩИЙ блок из dist/astro-blocks вместо
 * порта темы. Нужен блокам, которых нет в sections.map.json, но которые
 * конструктор адресует на странице (CartSummary стоит в pages/cart.json всех
 * пяти тем с собственным puck-id). Без этой ветки такие блоки выпадали из
 * любой проверки: в манифесте темы их нет, значит «missing», значит тест молчал.
 *
 * job.cascade === true — искать модуль ТОЙ ЖЕ лестницей, что и витрина:
 * dist/theme-sections/<тема>/manifest.json → dist/astro-blocks/theme-<тема>__… →
 * dist/astro-blocks/theme-base__… (defaultComponentResolver в
 * src/services/preview.service.ts). Без неё блок, которого нет в манифесте темы,
 * получал `missing` и выпадал из проверки — а на живом сайте он РИСУЕТСЯ общим
 * портом или собственным пакетом темы (Catalog лежит в packages/theme-<t>/blocks,
 * Publications/Video/Product у rose приходят из theme-base). Ровно так класс
 * «поле не подключено» и прятался: тест молчал там, где мерчант видел сырьё.
 *
 * job.live === true — прогнать props через ПОЛНУЮ живую цепочку рантайма:
 * adaptLegacyProps → deepMergeBlockProps(theme.json blockDefaults) →
 * resolveBlockProps(resolveDefaults). Ровно её проходит витрина
 * (v2-live-pages: extractPageBlocks → PreviewService.renderBlock) и точечный
 * hot-render конструктора (POST /preview/block). Нужен проверкам «дефолт
 * панели = то, что видит мерчант»: без нормализации и blockDefaults рендер
 * показывает состояние, которого на живом сайте не бывает (page-blocks
 * доставляет PopularProducts.cards/columns, а theme.json — Header.logoPosition
 * и десяток других), и проверка ловит расхождения, которых в проде нет.
 *
 * job.catalog — сырой каталог магазина ({products,collections,publications}) для
 * цепочек pipeline/live вместо EMPTY_CATALOG. Нужен проверкам «секция берёт
 * данные магазина, а не выдумывает»: товары/коллекции/публикации доезжают до
 * блока через __merfy (resolve-props → applySectionPolicy), и без каталога
 * такую проверку не сделать.
 *
 * job.pipeline === true — УРЕЗАННАЯ цепочка (adaptLegacyProps →
 * resolveBlockProps без blockDefaults) перед рендером, как это делает
 * preview.service. Нужен проверкам item-уровневого «глаза»: скрытые элементы
 * отбрасывает именно adaptLegacyProps, а satin Collections читает плитки из
 * `__merfy.resolved`, который собирает resolveBlockProps. Модули берём
 * скомпилированные (dist/src) — тест не должен подменять пайплайн своей копией.
 * Не поднялись — строка получает { pipelineError }, и тест падает громко.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { withDesignParity } from './prod-design-parity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');

async function main() {
  const theme = process.argv[2];
  // Задания приходят либо строкой JSON, либо «@путь» — файлом. Файл нужен не
  // для красоты: Linux режет ОДИН аргумент командной строки на 128 КиБ
  // (MAX_ARG_STRLEN), а пакетный прогон аудита настроек даёт ~330 КиБ. На
  // macOS такого предела нет, поэтому проверка была зелёной локально и давала
  // ноль прошедших проверок на раннере (CI 22.09, сегмент 9).
  const сырое = process.argv[3] ?? '[]';
  const jobs = JSON.parse(
    сырое.startsWith('@') ? readFileSync(сырое.slice(1), 'utf-8') : сырое,
  );
  const dist = resolve(SITES_ROOT, 'dist', 'theme-sections', theme);
  const manifest = JSON.parse(readFileSync(resolve(dist, 'manifest.json'), 'utf-8'));
  const { experimental_AstroContainer } = await import('astro/container');
  const container = await experimental_AstroContainer.create();
  const blocksDir = resolve(SITES_ROOT, 'dist', 'astro-blocks');
  let baseBlocks = null;
  const themeBaseEntry = (block) => {
    if (!baseBlocks) {
      try {
        baseBlocks = JSON.parse(readFileSync(resolve(blocksDir, 'manifest.json'), 'utf-8')).blocks ?? [];
      } catch {
        baseBlocks = [];
      }
    }
    return baseBlocks.find((b) => b.pkg === 'theme-base' && b.blockName === block);
  };
  /**
   * Лестница витрины: порт темы → пакет темы → theme-base. Повторяет
   * defaultComponentResolver построчно, включая имя артефакта
   * `<pkg>__<block>__<block>.mjs`.
   */
  const cascadeEntry = (block) => {
    const flat = manifest[block];
    if (flat) return resolve(dist, flat);
    if (!baseBlocks) {
      try {
        baseBlocks = JSON.parse(readFileSync(resolve(blocksDir, 'manifest.json'), 'utf-8')).blocks ?? [];
      } catch {
        baseBlocks = [];
      }
    }
    for (const pkg of [`theme-${theme}`, 'theme-base']) {
      const name = `${pkg}__${block}__${block}.mjs`;
      if (baseBlocks.some((b) => b.pkg === pkg && b.outputName === name)) {
        return resolve(blocksDir, name);
      }
    }
    return null;
  };

  // Нормализация рантайма — поднимаем один раз и только если её просят.
  let pipeline = null;
  let livePipeline = null;
  let pipelineError = null;
  if (jobs.some((j) => j.pipeline || j.live)) {
    try {
      const req = createRequire(import.meta.url);
      const { adaptLegacyProps } = req(resolve(SITES_ROOT, 'dist', 'src', 'themes', 'page-blocks.js'));
      const { resolveBlockProps } = req(resolve(SITES_ROOT, 'dist', 'src', 'render', 'resolve-props.js'));
      const { EMPTY_CATALOG, normalizeCatalog } = req(resolve(SITES_ROOT, 'dist', 'src', 'render', 'catalog.js'));
      const catalogOf = (raw) => (raw ? normalizeCatalog(raw) : EMPTY_CATALOG);
      pipeline = (block, raw, rawCatalog) => {
        const catalog = catalogOf(rawCatalog);
        const adapted = adaptLegacyProps(raw, null, block);
        const r = resolveBlockProps(block, adapted, catalog, {});
        return {
          ...r.props,
          siteId: 'test-site',
          __merfy: {
            siteId: 'test-site',
            themeId: theme,
            catalog,
            ...r.merfy,
          },
        };
      };
      // ПОЛНАЯ живая цепочка. Все три звена — те же скомпилированные модули,
      // что исполняет сервис: своей копии merge/нормализации тест не держит.
      const { deepMergeBlockProps } = req(resolve(SITES_ROOT, 'dist', 'src', 'services', 'preview.service.js'));
      const { getThemeManifest } = req(resolve(SITES_ROOT, 'dist', 'src', 'themes', 'theme-manifest-loader.js'));
      const { getBlockPuckDefaults } = req(resolve(SITES_ROOT, 'dist', 'src', 'render', 'block-defaults.js'));
      const { normalizeSlideshowProps } = req(resolve(SITES_ROOT, 'dist', 'src', 'generator', 'legacy-prop-normalizer.js'));
      const themeDefaults = getThemeManifest(theme)?.blockDefaults ?? {};
      livePipeline = async (block, raw, rawCatalog) => {
        const catalog = catalogOf(rawCatalog);
        // 1. Нормализация ревизии — extractPageBlocks / POST /preview/block.
        const adapted = adaptLegacyProps(raw, null, block);
        // 2. blockDefaults темы ПОД props мерчанта — PreviewService.renderBlock.
        const bd = themeDefaults[block] ?? {};
        let merged = deepMergeBlockProps(bd, adapted);
        if (block === 'Slideshow') merged = normalizeSlideshowProps(merged);
        // 3. resolve-props с теми же resolveDefaults, что renderBlock.
        const puckDefaults = await getBlockPuckDefaults(theme, block);
        const resolveDefaults = deepMergeBlockProps(puckDefaults, bd);
        const r = resolveBlockProps(block, merged, catalog, resolveDefaults);
        return {
          ...r.props,
          siteId: 'test-site',
          __merfy: {
            siteId: 'test-site',
            themeId: theme,
            catalog,
            ...r.merfy,
          },
        };
      };
    } catch (err) {
      pipelineError = String(err?.message ?? err).slice(0, 300);
    }
  }

  const out = [];
  for (const { block, props: rawProps, pkg, cascade, pipeline: usePipeline, live: useLive, catalog: rawCatalog } of jobs) {
    // Как на проде: признак режима «как у верстальщиков» (prod-design-parity.mjs).
    const props = withDesignParity(rawProps);
    let modPath = null;
    if (pkg === 'theme-base') {
      const entry = themeBaseEntry(block);
      if (entry) modPath = resolve(blocksDir, entry.outputName);
    } else if (cascade) {
      modPath = cascadeEntry(block);
    } else {
      const flat = manifest[block];
      if (flat) modPath = resolve(dist, flat);
    }
    if (!modPath) {
      out.push({ block, missing: true });
      continue;
    }
    if ((usePipeline && !pipeline) || (useLive && !livePipeline)) {
      out.push({ block, pipelineError: pipelineError ?? 'нет dist/src (pnpm build)' });
      continue;
    }
    try {
      const mod = await import(modPath);
      const finalProps = useLive
        ? await livePipeline(block, props, rawCatalog)
        : usePipeline
          ? pipeline(block, props, rawCatalog)
          : props;
      out.push({ block, html: await container.renderToString(mod.default, { props: finalProps }) });
    } catch (err) {
      out.push({ block, error: String(err?.message ?? err).slice(0, 300) });
    }
  }
  process.stdout.write(JSON.stringify(out));
}

main().catch((err) => {
  process.stderr.write(String(err?.stack ?? err));
  process.exit(1);
});
