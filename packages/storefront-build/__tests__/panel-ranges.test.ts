import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { panelForTheme, parsePanel, parseTheme, resolveTokens, tokenFields } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

// Схема панели и темы новой архитектуры (design.md блока 8): у поля с диапазоном (ползунок) значение темы лежит внутри
// диапазона. Иначе ползунок не может вернуть значение темы: «Размер» логотипа — 0–100 (владелец 24.09: «потолок 40 →
// 100»), а умолчание словаря width-logo — 120, поэтому тема задаёт своё.
const ROOT = fileURLToPath(new URL('../../../', import.meta.url));
const readJson = (path: string): unknown => JSON.parse(readFileSync(join(ROOT, path), 'utf8'));
const themeFile = z.object({ tokens: z.unknown(), panel: z.unknown().optional() });
const themeIds = Object.keys(
  z.record(z.string(), z.unknown()).parse(readJson('packages/storefront-build/theme-versions.json')),
);

// Строки «поле: значение вне min–max» для одной темы; пусто — всё в диапазоне.
function outOfRange(themeId: string): string[] {
  const theme = themeFile.parse(readJson(`packages/theme-${themeId}/theme.json`));
  const parsed = parseTheme(theme.tokens);
  const panel = panelForTheme(
    parsePanel(readJson('packages/theme-contract/panel/theme-panel.json'), parsed.dictionary),
    theme.panel,
  );
  const root = resolveTokens(parsed.dictionary, parsed.tokens, {}).root;
  return tokenFields(panel).flatMap((field) => {
    const value = root[field.token];
    if (field.range === undefined || typeof value !== 'number') return [];
    const inside = value >= field.range.min && value <= field.range.max;
    return inside ? [] : [`${themeId} ${field.id}: ${value} вне ${field.range.min}–${field.range.max}`];
  });
}

describe('значения тем внутри диапазонов полей панели', () => {
  it('темы новой архитектуры есть', () => {
    expect(themeIds).toContain('nova');
  });

  it.each(themeIds)('%s: у каждого поля с диапазоном значение темы — внутри диапазона', (themeId) => {
    expect(outOfRange(themeId)).toEqual([]);
  });
});
