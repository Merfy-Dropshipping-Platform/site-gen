import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';
import { PAGE_BASE_CSS } from '../src/page-base';

// База страницы в голове nova (блок 4 «Секций и SDK», Р4-12, Р4-13).
const SHOP_HEAD = new URL('../../../themes/nova/src/shop/ShopHead.astro', import.meta.url);
const CODE = new URL('../src/code.ts', import.meta.url);

describe('база страницы', () => {
  it('PAGE_BASE_CSS — файл @merfy/tokens/base.css', () => {
    const file = createRequire(import.meta.url).resolve('@merfy/tokens/base.css');
    expect(PAGE_BASE_CSS).toBe(readFileSync(file, 'utf8'));
    expect(PAGE_BASE_CSS).toContain('@layer theme, base, components, utilities;');
  });

  it('голова nova: merfy-base, потом merfy-fonts, merfy-tokens и код секций', () => {
    const head = readFileSync(SHOP_HEAD, 'utf8');
    const at = ['id="merfy-base"', 'id="merfy-fonts"', 'id="merfy-tokens"', 'head.codeHtml'].map((marker) =>
      head.indexOf(marker),
    );
    expect(at.every((index) => index >= 0)).toBe(true);
    expect([...at].sort((left, right) => left - right)).toEqual(at);
    expect(head).toContain('<style id="merfy-base" is:inline set:html={head.baseCss}></style>');
  });

  it('в стилях секций нет своей базы обёртки — она в base.css', () => {
    expect(readFileSync(CODE, 'utf8')).not.toContain('merfy-section{display:block}');
  });
});
