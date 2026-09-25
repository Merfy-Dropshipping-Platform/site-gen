#!/usr/bin/env node
/**
 * Замер: доезжает ли до разметки текст кнопки, у которой ЗАДАН ТОЛЬКО ТЕКСТ.
 *
 * Отдельный процесс, а не прямой вызов из jest: Astro Container в среде jest
 * отдаёт заглушку (замер 2026-09-16: 270 байт вместо ~7000 и пустой рендер),
 * поэтому доезд до разметки меряется тем же способом, что у соседей —
 * см. contact-form-text-paths.mjs.
 *
 * Использование: node login-button-text-paths.mjs <тема>
 * stdout: JSON { theme, withText, withTextAndLink, marker }
 *
 * Требует: pnpm build && pnpm build:blocks && pnpm build:theme-sections:all.
 */
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { withDesignParity } from './prod-design-parity.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SITES_ROOT = resolve(__dirname, '..', '..', '..');
const require = createRequire(import.meta.url);
const load = (p) => require(resolve(SITES_ROOT, 'dist', 'src', ...p.split('/')));

/** Только латиница и цифры — переживает uppercase и slugify портов. */
export const MARKER = 'CFBTN01Z';

async function renderWith(svc, theme, button) {
  const { adaptLegacyProps } = load('themes/page-blocks.js');
  const props = {
    ...adaptLegacyProps({ id: 'LoginSection-1', button }, null, 'LoginSection'),
    siteId: 'guard-site',
  };
  // Как на проде: признак режима «как у верстальщиков» (prod-design-parity.mjs).
  const html = await svc.renderBlock({ blockName: 'LoginSection', props: withDesignParity(props), themeId: theme });
  return String(html ?? '');
}

/** Подпись по умолчанию — ровно то, что было на кнопке до появления параметра. */
export const SUBMIT_FALLBACK = 'Получить ссылку для входа';

export async function collect(theme) {
  const { PreviewService } = load('services/preview.service.js');
  const svc = new PreviewService();
  const onlyText = await renderWith(svc, theme, { text: MARKER });
  const withLink = await renderWith(svc, theme, { text: MARKER, link: '/catalog' });
  const noProp = await renderWith(svc, theme, undefined);
  // Текст обязан стоять на КНОПКЕ ФОРМЫ (id="btn-magic"), а не на отдельной
  // ссылке над ней: владелец 2026-09-16 — «нужно нижнюю кнопку… и её менять».
  const submitChunk = onlyText.slice(onlyText.indexOf('btn-magic'));
  return {
    theme,
    marker: MARKER,
    withText: onlyText.includes(MARKER),
    withTextAndLink: withLink.includes(MARKER),
    onSubmitButton: submitChunk.includes(MARKER),
    extraAnchors: (onlyText.match(/<a[^>]*data-puck-subsection-field="button"/g) || []).length,
    fallbackWhenEmpty: noProp.includes(SUBMIT_FALLBACK),
  };
}

async function main() {
  const theme = process.argv[2];
  if (!theme) throw new Error('нужна тема: node login-button-text-paths.mjs <тема>');
  process.stdout.write(JSON.stringify(await collect(theme)));
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((err) => {
    process.stderr.write(String(err?.stack ?? err));
    process.exit(1);
  });
}
