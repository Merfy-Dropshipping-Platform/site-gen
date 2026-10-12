import { z } from 'zod';

// Проверка страниц без браузера (design.md блока 10, П10-3 Б): главная магазина отвечает 200; в теге конфига (блок 3)
// — новая версия темы; CSS токенов (блок 1) не пустой; каждый файл того же адреса, на который ссылаются <link href>,
// <script src> и import map ядра (блок 7), отвечает 200. Ловит «главная ссылается на файл стилей, которого нет в
// хранилище». Раздача держит указатель в кэше секунду (блок 5): главную спрашиваем до attempts раз.

export interface PageCheckDeps {
  fetch: (url: string) => Promise<Response>;
  attempts: number;
  delayMs: number;
}

export interface PageExpectation {
  // Версия темы в конфиге страницы; null — не сравниваем (выпуск платформы или расширения).
  version: string | null;
}

export interface PageCheck {
  ok: boolean;
  problems: string[];
  files: number;
}

const CONFIG = /<script type="application\/json" id="merfy-config">([\s\S]*?)<\/script>/;
const TOKENS = /<style id="merfy-tokens">([\s\S]*?)<\/style>/;
const IMPORT_MAP = /<script type="importmap"[^>]*>([\s\S]*?)<\/script>/;
const LINKED = /<(?:link|script)\b[^>]*?\b(?:href|src)="([^"]+)"/g;
const configSchema = z.object({ theme: z.object({ version: z.string() }) });
const importMapSchema = z.object({ imports: z.record(z.string(), z.string()) });

type Home = { status: number; html: string };

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

function jsonIn(html: string, pattern: RegExp): unknown {
  const match = pattern.exec(html);
  if (match === null) return null;
  try {
    return JSON.parse(match[1]);
  } catch {
    return null;
  }
}

const versionIn = (html: string): string | null => {
  const parsed = configSchema.safeParse(jsonIn(html, CONFIG));
  return parsed.success ? parsed.data.theme.version : null;
};

async function readHome(deps: PageCheckDeps, url: string): Promise<Home> {
  const response = await deps.fetch(`${url}/`);
  return { status: response.status, html: response.status === 200 ? await response.text() : '' };
}

// Главная, пока версия в конфиге не станет новой (или пока не кончатся попытки).
async function homeOf(deps: PageCheckDeps, url: string, expected: PageExpectation): Promise<Home> {
  let home = await readHome(deps, url);
  for (let attempt = 1; attempt < deps.attempts && isStale(home, expected); attempt += 1) {
    await wait(deps.delayMs);
    home = await readHome(deps, url);
  }
  return home;
}

const isStale = (home: Home, expected: PageExpectation): boolean =>
  home.status === 200 && expected.version !== null && versionIn(home.html) !== expected.version;

// Адреса файлов того же магазина: из ссылок и import map. Чужие адреса и data: не проверяем.
function linkedPaths(html: string, url: string): string[] {
  const origin = new URL(url).origin;
  const fromLinks = [...html.matchAll(LINKED)].map((match) => match[1]);
  const map = importMapSchema.safeParse(jsonIn(html, IMPORT_MAP));
  const fromMap = map.success ? Object.values(map.data.imports) : [];
  const own = [...fromLinks, ...fromMap]
    .map((link) => new URL(link, `${url}/`))
    .filter((link) => link.origin === origin);
  return [...new Set(own.map((link) => link.pathname))];
}

async function fileProblems(deps: PageCheckDeps, url: string, paths: readonly string[]): Promise<string[]> {
  const statuses = await Promise.all(paths.map(async (path) => (await deps.fetch(`${url}${path}`)).status));
  return paths.flatMap((path, index) => (statuses[index] === 200 ? [] : [`${path} ответил ${statuses[index]}`]));
}

function headProblems(html: string, expected: PageExpectation): string[] {
  const version = versionIn(html);
  const versionProblem =
    expected.version !== null && version !== expected.version
      ? [`в конфиге страницы версия темы ${version ?? 'не найдена'}, ждали ${expected.version}`]
      : [];
  const tokens = TOKENS.exec(html)?.[1] ?? '';
  return [...versionProblem, ...(tokens.trim() === '' ? ['CSS токенов пустой'] : [])];
}

export async function checkShopPages(deps: PageCheckDeps, url: string, expected: PageExpectation): Promise<PageCheck> {
  const home = await homeOf(deps, url, expected);
  if (home.status !== 200) return { ok: false, problems: [`главная ответила ${home.status}`], files: 0 };
  const paths = linkedPaths(home.html, url);
  const problems = [...headProblems(home.html, expected), ...(await fileProblems(deps, url, paths))];
  return { ok: problems.length === 0, problems, files: paths.length };
}
