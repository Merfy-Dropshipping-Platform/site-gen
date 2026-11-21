// dembrandt (MIT) на уже открытой нами вкладке (`borrow.mjs`): их `extractBranding(url, spinner, browser)` из
// `dembrandt/extractors` с браузером-переходником. Их шаги после загрузки (прокрутка, баннер cookie, ожидание
// стабильности, 17 разборов, раскрытие меню) идут как в их CLI, без загрузки сайта заново.
//
// Кроме наведения: `page.$$` в dembrandt 0.41.0 зовут только два прохода наведения на кнопки и ссылки (цвета hover/focus
// в палитру — lib/extractors/index.js:1012, сдвиги анимаций при наведении — breakpoints.js:222). Наш переходник
// (`tools/dembrandt.ts`) ни палитру, ни эти сдвиги не читает, а на большом DOM проходы шли 6–17 с (gymshark — 17 с из 31).
// Пустой список элементов — проходы ничего не наводят.
//
// Аргументы — `tabArgs`; ответ — JSON в stdout, без служебных `_teach` и `_discoveredLinks`.
import { createRequire } from 'node:module';
import { extractBranding } from 'dembrandt/extractors';
import { answer, findTab, lend, tabArgs } from './borrow.mjs';

const { url, cdp, targetId, status } = tabArgs(process.argv.slice(2));
// Предупреждения пакет печатает через console.log и в тихом режиме: в stdout им не место — там ответ.
console.log = (...parts) => process.stderr.write(`${parts.join(' ')}\n`);

const require = createRequire(import.meta.url);
const { chromium } = require(createRequire(require.resolve('dembrandt')).resolve('playwright-core'));
const spinner = { text: '', start: () => spinner, stop: () => spinner, warn: () => spinner, fail: () => spinner };

const browser = await chromium.connectOverCDP(cdp);
const page = await findTab(browser, targetId);
page.$$ = async () => [];
const host = lend(browser, page, status);
const { _teach, _discoveredLinks, ...result } = await extractBranding(url, spinner, host, { verbose: false });
answer(result);
