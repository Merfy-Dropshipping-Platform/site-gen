// Превью — один HTML (design.md блока 8, «Превью»): iframe конструктора открывает его с адреса шлюза
// (/api/sites/:id/preview), а файлы клиента темы (/_astro/…) там не раздаются. Поэтому ссылки на CSS темы заменяются
// самим CSS, а шрифты woff2 в нём — data:-адресами. Только для превью: страницы магазина отдаются как нарисованы
// (блок 4), их файлы клиента лежат рядом в хранилище.

const STYLESHEET = /<link rel="stylesheet" href="(\/_astro\/[^"]+\.css)"[^>]*>/g;
const ASSET_URL = /url\((\/_astro\/[^)]+\.woff2)\)/g;

// Файлы клиента по адресу от корня сайта: «/_astro/x.css» → байты.
export type Assets = ReadonlyMap<string, Uint8Array>;

const decoder = new TextDecoder();

function dataUrl(assets: Assets, path: string): string {
  const content = assets.get(path);
  return content === undefined
    ? `url(${path})`
    : `url(data:font/woff2;base64,${Buffer.from(content).toString('base64')})`;
}

function inlineCss(assets: Assets, path: string): string {
  const content = assets.get(path);
  if (content === undefined) return `<link rel="stylesheet" href="${path}">`;
  const css = decoder.decode(content).replace(ASSET_URL, (_, url: string) => dataUrl(assets, url));
  return `<style>${css}</style>`;
}

// CSS темы — внутрь страницы, шрифты woff2 в нём — data:-адресами. Чего нет среди файлов клиента — остаётся ссылкой.
export const inlineAssets = (html: string, assets: Assets): string =>
  html.replace(STYLESHEET, (_, path: string) => inlineCss(assets, path));
