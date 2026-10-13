import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { STAND_FONTS_PATTERN, STAND_PATH } from '../stand-path.mjs';

// Страница стенда в каждой новой теме лежит по одному пути — вне src/pages, поэтому сама Astro её не собирает (Э2-3 А).
const STAND_PAGE = 'src/stand/StandPage.astro';
// Папка файлов шрифтов библиотеки (блок 12) — её читает stand-fonts.mjs.
const FONTS_CACHE = '../../../theme-contract/fonts/.cache/_fonts/';
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
        // Файлы шрифтов стенда (блок 12): /_fonts/… — из папки библиотеки на диске, как у магазина с его домена.
        // Путь к папке — отсюда: этот файл Astro грузит с диска, а stand-fonts.mjs уходит в чанк сборки.
        process.env.MERFY_STAND_FONTS_DIR = fileURLToPath(new URL(FONTS_CACHE, import.meta.url));
        injectRoute({ pattern: STAND_FONTS_PATTERN, entrypoint: new URL('./stand-fonts.mjs', import.meta.url) });
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
