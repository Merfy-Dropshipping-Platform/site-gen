import { describe, expect, it } from 'vitest';
import { inlineAssets } from '../src/inline-assets';

// Превью одним HTML (design.md блока 8): CSS темы — внутрь страницы, шрифты woff2 — data:-адресами.
const encode = (text: string): Uint8Array => new TextEncoder().encode(text);
const assets = new Map([
  [
    '/_astro/stand.css',
    encode('@font-face{src:url(/_astro/m.woff2) format("woff2"),url(/_astro/m.woff)}.a{color:red}'),
  ],
  ['/_astro/m.woff2', encode('woff2')],
]);

describe('inlineAssets', () => {
  it('ссылка на CSS темы — его текстом, woff2 — data:-адресом, woff остаётся ссылкой', () => {
    const html = '<head><link rel="stylesheet" href="/_astro/stand.css"></head>';
    expect(inlineAssets(html, assets)).toBe(
      '<head><style>@font-face{src:url(data:font/woff2;base64,d29mZjI=) format("woff2"),url(/_astro/m.woff)}.a{color:red}</style></head>',
    );
  });

  it('CSS или шрифта нет среди файлов клиента — остаётся ссылкой; чужие ссылки не трогаются', () => {
    const html =
      '<link rel="stylesheet" href="/_astro/gone.css"><link rel="stylesheet" href="https://cdn.example/x.css">';
    expect(inlineAssets(html, assets)).toBe(html);
    const missingFont = new Map([['/_astro/s.css', encode('a{src:url(/_astro/gone.woff2)}')]]);
    expect(inlineAssets('<link rel="stylesheet" href="/_astro/s.css">', missingFont)).toBe(
      '<style>a{src:url(/_astro/gone.woff2)}</style>',
    );
  });
});
