import { join } from 'node:path';
import { acceptReleases, type ReleaseDeps, type ReleaseFolder } from '@merfy/storefront-sections';

// Дверь выпуска при старте сборщика (design.md блока 7, п. 21): секции платформы (выпуск — версия ядра из образа) и
// секции каждой загруженной темы (выпуск — версия темы) идут через приём блока 7. Принятое раньше — «без изменений»,
// без сборки; отказ секции — строка журнала section-refused, сборщик стартует дальше.
export const PLATFORM_SECTIONS = 'packages/storefront-shell/sections';

export function releaseFolders(
  root: string,
  shellVersion: string,
  themes: ReadonlyMap<string, { version: string }>,
): ReleaseFolder[] {
  const platform: ReleaseFolder = {
    door: { author: 'platform', release: shellVersion },
    root: join(root, PLATFORM_SECTIONS),
  };
  const ofThemes = [...themes].map(
    ([theme, state]): ReleaseFolder => ({
      door: { author: 'theme', theme, release: state.version },
      root: join(root, 'themes', theme, 'sections'),
    }),
  );
  return [platform, ...ofThemes];
}

// Итог — одна строка журнала section-releases: сколько принято, без изменений и с отказом.
export async function acceptSectionReleases(deps: ReleaseDeps, folders: readonly ReleaseFolder[]): Promise<void> {
  const summary = await acceptReleases(deps, folders);
  deps.log('section-releases', { ...summary });
}
