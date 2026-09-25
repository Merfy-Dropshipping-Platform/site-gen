#!/usr/bin/env node
/**
 * Замер поля «Текст» секции «Контактная форма» по ТРЁМ путям рендера.
 *
 * Зачем отдельный коллектор. Панель, которая показывает поле, а введённый текст
 * никуда не попадает, хуже отсутствия поля. Пути рендера у нас три, и они
 * РАЗНЫЕ по подготовке пропсов — проверять надо каждый:
 *
 *   1. точечный hot-render блока (POST /preview/block): конструктор шлёт СЫРЫЕ
 *      props, контроллер гонит их через `adaptLegacyProps` и зовёт
 *      `PreviewService.renderBlock` (preview.controller.ts:710);
 *   2. страница превью конструктора: `extractPageBlocks` → тот же `renderBlock`
 *      → `composeV2Page` с `assetPrefix='/__theme/<тема>'`
 *      (preview.controller.ts @Get + v2-page-composer);
 *   3. собранная витрина: `composeContentPagesIntoDist` — та же тройка, но
 *      `assetPrefix=null` и `isPreview:false` (v2-live-pages.ts:156-247).
 *
 * Берём СКОМПИЛИРОВАННЫЕ модули (`dist/src/...`), те самые, что работают в
 * проде, а не пересобранную тестом копию пайплайна.
 *
 * Использование: node contact-form-text-paths.mjs <тема>
 * На stdout — JSON: { theme, paths: { hot, preview, live }, empty: {...} }.
 *
 * Требует: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */
import { createRequire } from 'node:module';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDesignParity } from './prod-design-parity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);

/** Маркер: только латиница в верхнем регистре и цифры — переживает toUpperCase
 *  и slugify портов (та же причина, что у rich-text-coverage.mjs). */
export const MARKER = 'CFTEXT01Z';
/** Значение, которое панель пишет в проп при нажатых «Ж» и «К» (wrapText). */
export const PAYLOAD = `<strong><em>${MARKER}</em></strong>`;

const BLOCK = 'ContactForm';
const BLOCK_ID = 'ContactForm-1';
const PAGE_KEY = 'page-contacts';

const load = (p) => require(resolve(SITES_ROOT, 'dist', 'src', ...p.split('/')));

/** Минимальный шелл страницы темы — та же структура, что читает composeV2Page
 *  из dist темы: <body> … последний </footer>. */
const SHELL = [
  '<!DOCTYPE html><html lang="ru"><head><title>Шелл</title></head><body>',
  '<header>шапка шелла</header><main>тело шелла</main><footer>подвал шелла</footer>',
  '</body></html>',
].join('');

/** Ревизия с одной страницей «Контакты» и одной секцией. */
const revisionFor = (description, textSize) => ({
  pagesData: {
    [PAGE_KEY]: {
      content: [
        {
          type: BLOCK,
          props: {
            id: BLOCK_ID,
            ...(description === undefined ? {} : { description }),
            ...(textSize === undefined ? {} : { textSize }),
          },
        },
      ],
    },
  },
});

async function renderHot(svc, theme, description, textSize) {
  const { adaptLegacyProps } = load('themes/page-blocks.js');
  const raw = {
    id: BLOCK_ID,
    ...(description === undefined ? {} : { description }),
    ...(textSize === undefined ? {} : { textSize }),
  };
  // Дословно ветка контроллера: adaptLegacyProps(props, null, blockType) + siteId.
  const props = { ...adaptLegacyProps(raw, null, BLOCK), siteId: 'b13-site' };
  // Как на проде: POST /preview/block добавляет признак режима (prod-design-parity.mjs).
  return svc.renderBlock({ blockName: BLOCK, props: withDesignParity(props), themeId: theme });
}

async function renderComposed(svc, theme, description, { live, textSize }) {
  const { extractPageBlocks } = load('themes/page-blocks.js');
  const { composeV2Page } = load('themes/v2-page-composer.js');
  const blocks = await extractPageBlocks(
    revisionFor(description, textSize),
    PAGE_KEY,
    null,
    theme,
    'b13-site',
  );
  if (!blocks || blocks.length === 0) return null;
  const blocksHtml = await Promise.all(
    blocks.map((b) =>
      svc.renderBlock({
        blockName: b.type,
        props: withDesignParity({ ...b.props, siteId: 'b13-site' }),
        themeId: theme,
        isPreview: !live,
      }),
    ),
  );
  return composeV2Page({
    shellHtml: SHELL,
    blocksHtml,
    blockTypes: blocks.map((b) => b.type),
    assetPrefix: live ? null : `/__theme/${theme}`,
  });
}

export async function collect(theme) {
  const { PreviewService } = load('services/preview.service.js');
  const svc = new PreviewService();
  const out = { theme, paths: {}, empty: {} };
  out.paths.hot = await renderHot(svc, theme, PAYLOAD);
  out.paths.preview = await renderComposed(svc, theme, PAYLOAD, { live: false });
  out.paths.live = await renderComposed(svc, theme, PAYLOAD, { live: true });
  // Пустое значение обязано вести себя как «поля нет»: иначе «Текст» без текста
  // рисовал бы пустой абзац и ломал вертикальный ритм секции.
  out.empty.blank = await renderHot(svc, theme, '');
  out.empty.absent = await renderHot(svc, theme, undefined);
  // «Размер текста» (`textSize`) — просьба владельца 2026-09-16. Меряем те же
  // пути: поле, которое рисуется в панели, но не доезжает до витрины, — это
  // ровно тот класс бага, ради которого коллектор и написан.
  out.sizes = {};
  out.sizesLive = {};
  for (const size of ['small', 'medium', 'large']) {
    out.sizes[size] = await renderHot(svc, theme, PAYLOAD, size);
    out.sizesLive[size] = await renderComposed(svc, theme, PAYLOAD, {
      live: true,
      textSize: size,
    });
  }
  return out;
}

async function main() {
  const theme = process.argv[2];
  if (!theme) throw new Error('нужна тема: node contact-form-text-paths.mjs <тема>');
  process.stdout.write(JSON.stringify(await collect(theme)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err));
    process.exit(1);
  });
}
