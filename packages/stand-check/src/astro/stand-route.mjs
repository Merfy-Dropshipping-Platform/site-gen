import { STAND_PATH } from '../stand-path.mjs';

// Страница стенда в каждой новой теме лежит по одному пути — вне src/pages, поэтому сама Astro её не собирает (Э2-3 А).
const STAND_PAGE = 'src/stand/StandPage.astro';
const STAND_PATHNAMES = new Set([STAND_PATH, `${STAND_PATH}/`]);

/**
 * @typedef {{ pattern: string, entrypoint: URL }} StandRouteEntry
 * @typedef {{ config: { root: URL }, injectRoute: (route: StandRouteEntry) => void }} ConfigSetup
 * @typedef {{ name: string, hooks: { 'astro:config:setup': (setup: ConfigSetup) => void } }} StandIntegration
 */

/**
 * Интеграция Astro: адрес стенда появляется, только когда сборку запустили с флагом (design.md 5.2).
 * Тип записан своей формой, а не AstroIntegration: пакет не тянет astro в зависимости, Astro принимает такой объект.
 * @param {{ enabled: boolean }} options
 * @returns {StandIntegration}
 */
export function standRoute({ enabled }) {
  return {
    name: 'merfy-stand-route',
    hooks: {
      'astro:config:setup': ({ config, injectRoute }) => {
        if (!enabled) return;
        injectRoute({ pattern: STAND_PATH, entrypoint: new URL(STAND_PAGE, config.root) });
      },
    },
  };
}

/**
 * Фильтр карты сайта: @astrojs/sitemap передаёт полный адрес страницы. Запас на dev, где страница есть.
 * @param {string} page
 * @returns {boolean}
 */
export const withoutStand = (page) => !STAND_PATHNAMES.has(new URL(page).pathname);
