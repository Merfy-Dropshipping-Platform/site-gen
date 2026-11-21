// designlang (MIT) на уже открытой нами вкладке (`borrow.mjs`). В их коде нет приёма готового браузера:
// `extractDesignLanguage(url, { wsEndpoint })` сам зовёт `chromium.connectOverCDP` своего playwright (их
// src/crawler.js:59), поэтому подключение здесь подменяется на браузер-переходник над нашей вкладкой. `--smart`
// (модель) не включаем. Аргументы — `tabArgs`; ответ — JSON в stdout без `_raw` (сырые стили всех элементов, мегабайты).
import { createRequire } from 'node:module';
import { extractDesignLanguage } from 'designlang';
import { answer, findTab, lend, tabArgs } from './borrow.mjs';

const { url, cdp, targetId, status } = tabArgs(process.argv.slice(2));

const require = createRequire(import.meta.url);
// Тот же объект `chromium`, что импортирует designlang: ESM-обёртка playwright отдаёт его из CJS-модуля.
const { chromium } = require(createRequire(require.resolve('designlang')).resolve('playwright'));
const browser = await chromium.connectOverCDP(cdp);
const host = lend(browser, await findTab(browser, targetId), status);
chromium.connectOverCDP = async () => host;

const { _raw, ...design } = await extractDesignLanguage(url, { wsEndpoint: cdp, width: 1366, height: 900 });
answer(design);
