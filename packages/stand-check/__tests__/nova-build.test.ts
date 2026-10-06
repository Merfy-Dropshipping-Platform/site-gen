import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildNova, readBuilt, SITEMAP, STAND_HTML } from './support/nova';

describe('тема nova: страница стенда только по флагу', () => {
  it('без флага страницы нет, в карте сайта — только главная', () => {
    const outDir = buildNova(undefined);
    expect(existsSync(path.join(outDir, STAND_HTML))).toBe(false);
    expect(readBuilt(outDir, SITEMAP)).toContain('<loc>https://example.com/</loc>');
    expect(readBuilt(outDir, SITEMAP)).not.toContain('theme-stand');
  });

  it('с флагом /theme-stand собран, закрыт от индексации и в карту сайта не попал', () => {
    const outDir = buildNova('1');
    expect(readBuilt(outDir, STAND_HTML)).toContain('<meta name="robots" content="noindex">');
    expect(readBuilt(outDir, SITEMAP)).toContain('<loc>https://example.com/</loc>');
    expect(readBuilt(outDir, SITEMAP)).not.toContain('theme-stand');
  });
});
