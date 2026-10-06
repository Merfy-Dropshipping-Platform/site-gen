import type { Page } from 'playwright';
import { normalizePassport } from '../passport/normalize';
import { TOKEN_SETS } from '../token-sets';
import type { Passport, RequestEntry, Target } from '../types';
import {
  readFonts,
  readGlobals,
  readScripts,
  readSections,
  readStorage,
  readTokens,
  relativeToOrigin,
  scriptEntries,
} from './page-facts';

export type Collected = { passport: Passport; sections: string[] };

async function requestEntries(page: Page, origin: string): Promise<RequestEntry[]> {
  const requests = await page.requests();
  const statuses = await Promise.all(requests.map(async (request) => (await request.response())?.status() ?? 0));
  return requests.map((request, index) => ({ url: relativeToOrigin(request.url(), origin), status: statuses[index] }));
}

async function errorTexts(page: Page): Promise<string[]> {
  const messages = await page.consoleMessages();
  const consoleErrors = messages.filter((message) => message.type() === 'error').map((message) => message.text());
  const pageErrors = await page.pageErrors();
  return [...consoleErrors, ...pageErrors.map((error) => error.message)];
}

// Тонкий слой над Playwright (design.md 5.3): снимает факты с открытой страницы, остальное делают чистые функции.
// Страницу открывает тот, кто зовёт: запросы и ошибки Playwright помнит с её открытия (page.requests и другие).
export async function collectWithTokens(page: Page, target: Target, tokenNames: readonly string[]): Promise<Collected> {
  await page.waitForLoadState('networkidle');
  const url = new URL(page.url());
  const raw = {
    version: 1,
    page: url.pathname,
    target,
    scripts: scriptEntries(await page.evaluate(readScripts), url.origin),
    globals: await page.evaluate(readGlobals),
    storage: await page.evaluate(readStorage),
    cookies: (await page.context().cookies()).map((cookie) => cookie.name),
    requests: await requestEntries(page, url.origin),
    errors: await errorTexts(page),
    tokens: await page.evaluate(readTokens, tokenNames),
    fonts: await page.evaluate(readFonts),
  };
  return { passport: normalizePassport(raw), sections: await page.evaluate(readSections) };
}

// Паспорт стенда: токены снимаются по именам набора base (src/token-sets.ts).
export const collectPassport = (page: Page, target: Target): Promise<Collected> =>
  collectWithTokens(page, target, TOKEN_SETS.base);
