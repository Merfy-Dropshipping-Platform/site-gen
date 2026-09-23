/**
 * `normalizeBlockProps` — одно имя порта для нормализации пропсов блока,
 * которую сегодня уже делает общая `adaptLegacyProps` (themes/page-blocks.ts).
 *
 * Бриф: merfy-mcp/docs/plans/2026-09-23-wave1-content-port.md §1.5.
 *
 * `adaptLegacyProps` уже общая — страница (`extractPageBlocks`, которую зовут
 * и превью страницы, и сборка витрины через `v2-live-pages.ts`) и точечный
 * блок (`PreviewController.renderBlock`) вызывали её напрямую, каждый своим
 * именем вызова. Здесь — просто одна именованная точка входа поверх той же
 * функции, чтобы страница/блок/сборка звали одно и то же имя. Результат не
 * меняется (снимки секций — src/themes/__tests__/section-html-snapshot.spec.ts).
 */
import { adaptLegacyProps } from '../themes/page-blocks';

export function normalizeBlockProps(
  props: Record<string, unknown>,
  publicUrl: string | null,
  blockType: string,
): Record<string, unknown> {
  return adaptLegacyProps(props, publicUrl, blockType);
}
