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
 * job.pipeline === true — прогнать props через РАБОЧУЮ нормализацию рантайма
 * (adaptLegacyProps → resolveBlockProps) перед рендером, как это делает
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

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');

async function main() {
  const theme = process.argv[2];
  const jobs = JSON.parse(process.argv[3] ?? '[]');
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

  // Нормализация рантайма — поднимаем один раз и только если её просят.
  let pipeline = null;
  let pipelineError = null;
  if (jobs.some((j) => j.pipeline)) {
    try {
      const req = createRequire(import.meta.url);
      const { adaptLegacyProps } = req(resolve(SITES_ROOT, 'dist', 'src', 'themes', 'page-blocks.js'));
      const { resolveBlockProps } = req(resolve(SITES_ROOT, 'dist', 'src', 'render', 'resolve-props.js'));
      const { EMPTY_CATALOG } = req(resolve(SITES_ROOT, 'dist', 'src', 'render', 'catalog.js'));
      pipeline = (block, raw) => {
        const adapted = adaptLegacyProps(raw, null, block);
        const r = resolveBlockProps(block, adapted, EMPTY_CATALOG, {});
        return {
          ...r.props,
          siteId: 'test-site',
          __merfy: {
            siteId: 'test-site',
            themeId: theme,
            catalog: EMPTY_CATALOG,
            ...r.merfy,
          },
        };
      };
    } catch (err) {
      pipelineError = String(err?.message ?? err).slice(0, 300);
    }
  }

  const out = [];
  for (const { block, props, pkg, pipeline: usePipeline } of jobs) {
    let modPath = null;
    if (pkg === 'theme-base') {
      const entry = themeBaseEntry(block);
      if (entry) modPath = resolve(blocksDir, entry.outputName);
    } else {
      const flat = manifest[block];
      if (flat) modPath = resolve(dist, flat);
    }
    if (!modPath) {
      out.push({ block, missing: true });
      continue;
    }
    if (usePipeline && !pipeline) {
      out.push({ block, pipelineError: pipelineError ?? 'нет dist/src (pnpm build)' });
      continue;
    }
    try {
      const mod = await import(modPath);
      const finalProps = usePipeline ? pipeline(block, props) : props;
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
