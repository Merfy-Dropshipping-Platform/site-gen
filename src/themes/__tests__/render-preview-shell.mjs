#!/usr/bin/env node
/**
 * Дочерний рендер СИНТЕТИЧЕСКОГО шелла превью (PreviewService.renderPreviewPage —
 * легаси-путь превью конструктора) для сторожа cookie-consent.spec.ts.
 *
 * В jest настоящий контейнер Astro и скомпилированные модули dist/astro-blocks
 * не грузятся (ESM + динамический import без VM-модулей), поэтому сервис
 * запускается здесь, под tsx, со своим контейнером по умолчанию — ровно как
 * в проде. Нужен `pnpm build:blocks`.
 *
 * Использование: tsx render-preview-shell.mjs <тема> → HTML на stdout.
 */
import 'reflect-metadata';
// Сервис — CommonJS (tsconfig сервиса): именованный экспорт берём из default.
const mod = await import('../../services/preview.service.ts');
const { PreviewService } = mod.PreviewService ? mod : mod.default;

const theme = process.argv[2] ?? 'flux';
const html = await new PreviewService().renderPreviewPage({
  blocks: [],
  tokensCss: '',
  fontHead: '',
  themeId: theme,
  page: 'page-checkout',
  siteId: 'site-1',
  publicUrl: null,
});
process.stdout.write(html);
