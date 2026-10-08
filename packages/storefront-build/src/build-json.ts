import type { StorefrontManifest } from './manifest';

// /build.json новой темы (design.md блока 4, В4-5): пишется из манифеста, без времени сборки. Поля siteId, theme и
// sitesCommit — те же, что у нынешних тем (writeBuildStamp в src/generator/build.service.ts): sitesCommit читает поезд
// выпуска (scripts/release/train.mjs). Где файл лежит, решает блок 5.
export const buildJsonOf = (manifest: StorefrontManifest): string => {
  const stamp = {
    siteId: manifest.shop.id,
    theme: manifest.theme.id,
    themeVersion: manifest.theme.version,
    sitesCommit: manifest.platform.commit,
    buildKey: manifest.key,
  };
  return `${JSON.stringify(stamp, null, 2)}\n`;
};
