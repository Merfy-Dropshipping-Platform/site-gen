import { FONT_REGISTRY } from '@merfy/storefront-build';
import { describe, expect, it } from 'vitest';
import { inlineFonts, type FontBytes } from '../src/preview-fonts';

// Шрифты в превью (блок 12): /_fonts/… в CSS — data:-адресами из хранилища; каждый файл читается один раз.
const LATIN = FONT_REGISTRY.fonts.onest.subsets.latin.files.wght.path;
const CYRILLIC = FONT_REGISTRY.fonts.onest.subsets.cyrillic.files.wght.path;

function reader(known: Record<string, number[]>): { bytesOf: FontBytes; reads: string[] } {
  const reads: string[] = [];
  const bytesOf: FontBytes = (path) => {
    reads.push(path);
    return Promise.resolve(path in known ? new Uint8Array(known[path]) : null);
  };
  return { bytesOf, reads };
}

describe('inlineFonts', () => {
  it('файл есть — data:-адрес woff2; один путь дважды — одно чтение', async () => {
    const { bytesOf, reads } = reader({ [LATIN]: [1, 2, 3] });
    const css = `a{src:url(/${LATIN}) format("woff2")}b{src:url(/${LATIN}) format("woff2")}`;
    expect(await inlineFonts(css, bytesOf)).toBe(
      'a{src:url(data:font/woff2;base64,AQID) format("woff2")}b{src:url(data:font/woff2;base64,AQID) format("woff2")}',
    );
    expect(reads).toEqual([LATIN]);
  });

  it('файла нет в хранилище — ссылка остаётся как была', async () => {
    const { bytesOf } = reader({});
    const css = `a{src:url(/${CYRILLIC}) format("woff2")}`;
    expect(await inlineFonts(css, bytesOf)).toBe(css);
  });

  it('CSS без шрифтов не меняется и в хранилище не ходит', async () => {
    const { bytesOf, reads } = reader({});
    expect(await inlineFonts('', bytesOf)).toBe('');
    expect(reads).toEqual([]);
  });
});
