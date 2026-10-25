import { createHash, randomUUID } from 'node:crypto';
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { chromium, firefox, webkit, type Browser, type BrowserType, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

// Проба CSP (блок 13 «Секций и SDK», часть 13б, Р13б-12): на этом стоят две политики витрины. Обычная — встроенный код
// и код, который он вставил, проходят по хешу, файл — по 'self', блок данных JSON — не нарушение. Строгая
// ('strict-dynamic') — файл с integrity проходит по хешу, скрипты, которые он создал (файл и встроенный), проходят сами;
// файл и встроенный код без хеша — нет: 'unsafe-inline' и https: браузер с CSP3 не читает. Report-Only — код
// выполняется, отчёт уходит. Движки — CSP_PROBE_ENGINES через запятую, по умолчанию chromium.
const ENGINES: Readonly<Record<string, BrowserType>> = { chromium, firefox, webkit };
const NAMES = (process.env.CSP_PROBE_ENGINES ?? 'chromium').split(',').map((name) => name.trim());
const TAIL = "object-src 'none'; base-uri 'none'; report-uri /csp";
const SETTLE_MS = 500;
const POLL = { timeout: 10_000 };

const digest = (text: string): string => createHash('sha256').update(text, 'utf8').digest('base64');
const hash = (text: string): string => `'sha256-${digest(text)}'`;
const mark = (name: string): string => `(window.__p=window.__p||{}).${name}=1;`;
const addFile = (src: string): string =>
  `var f=document.createElement('script');f.src=${JSON.stringify(src)};document.head.append(f);`;
const addInline = (code: string): string =>
  `var i=document.createElement('script');i.textContent=${JSON.stringify(code)};document.head.append(i);`;
const tag = (code: string, attributes = ''): string => `<script${attributes}>${code}</script>`;
const page = (head: string): string => `<!doctype html><html><head>${head}</head><body></body></html>`;
const pause = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

const HASHED = mark('hashed');
const INSERTED = mark('insert');
const INSERTER = addInline(INSERTED);
const BOOT = mark('boot');
const FILE_JS = mark('file') + addFile('/dyn.js') + addInline(mark('dynInline'));
const FILES: Readonly<Record<string, string>> = {
  '/self.js': mark('self'),
  '/file.js': FILE_JS,
  '/dyn.js': mark('dynExternal'),
  '/other.js': mark('other'),
};

interface ProbePage {
  header: string;
  policy: string;
  html: string;
  marks: string[];
}

const PAGES: Readonly<Record<string, ProbePage>> = {
  '/normal': {
    header: 'Content-Security-Policy',
    policy: `default-src 'self'; script-src 'self' ${hash(HASHED)} ${hash(INSERTER)} ${hash(INSERTED)}; ${TAIL}`,
    html: page(
      tag('{"v":1}', ' type="application/json" id="merfy-config"') +
        tag(HASHED) +
        tag(mark('unhashed')) +
        tag('', ' src="/self.js"') +
        tag(INSERTER),
    ),
    marks: ['hashed', 'insert', 'self'],
  },
  '/strict': {
    header: 'Content-Security-Policy',
    policy: `script-src 'strict-dynamic' ${hash(BOOT)} ${hash(FILE_JS)} 'unsafe-inline' https:; ${TAIL}`,
    html: page(
      tag(BOOT) +
        tag('', ` type="module" src="/file.js" integrity="sha256-${digest(FILE_JS)}"`) +
        tag('', ' src="/other.js"') +
        tag(mark('unsafeInline')),
    ),
    marks: ['boot', 'dynExternal', 'dynInline', 'file'],
  },
  '/report': {
    header: 'Content-Security-Policy-Report-Only',
    policy: "script-src 'none'; report-uri /csp",
    html: page(tag(mark('reportOnly'))),
    marks: ['reportOnly'],
  },
};

interface ProbeServer {
  origin: string;
  reports: Record<string, unknown>[];
  close: () => Promise<void>;
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const readBody = (request: IncomingMessage): Promise<string> =>
  new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk: string) => (body += chunk));
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });

// POST — отчёт CSP (report-uri); GET — файл из FILES или страница из PAGES со своим заголовком.
async function answer(request: IncomingMessage, response: ServerResponse, reports: Record<string, unknown>[]) {
  const path = new URL(request.url ?? '/', 'http://probe').pathname;
  if (request.method === 'POST') {
    const body: unknown = JSON.parse(await readBody(request));
    const report = isRecord(body) ? body['csp-report'] : undefined;
    if (isRecord(report)) reports.push(report);
    response.writeHead(204).end();
    return;
  }
  const file: string | undefined = FILES[path];
  const probe: ProbePage | undefined = PAGES[path];
  if (file !== undefined) response.writeHead(200, { 'content-type': 'text/javascript' }).end(file);
  else if (probe !== undefined)
    response
      .writeHead(200, { 'content-type': 'text/html; charset=utf-8', [probe.header]: probe.policy })
      .end(probe.html);
  else response.writeHead(404).end();
}

async function startServer(): Promise<ProbeServer> {
  const reports: Record<string, unknown>[] = [];
  const server = createServer((request, response) => {
    answer(request, response, reports).catch(() => response.writeHead(400).end());
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const origin = `http://127.0.0.1:${typeof address === 'object' && address !== null ? address.port : 0}`;
  const close = (): Promise<void> =>
    new Promise((resolve) => {
      server.closeAllConnections();
      server.close(() => resolve());
    });
  return { origin, reports, close };
}

const marksOf = (tab: Page): Promise<string[]> =>
  tab.evaluate(() => {
    const marks: unknown = Reflect.get(window, '__p');
    return typeof marks === 'object' && marks !== null ? Object.keys(marks).sort() : [];
  });

let server: ProbeServer;

beforeAll(async () => {
  server = await startServer();
});

afterAll(async () => {
  await server?.close();
});

describe.each(NAMES)('CSP в %s', (name) => {
  let browser: Browser;
  // Отчёты своей страницы: метка страницы — в её адресе (document-uri и другие поля отчёта).
  const reportsFor = (token: string): Record<string, unknown>[] =>
    server.reports.filter((report) => JSON.stringify(report).includes(token));

  async function open(path: string): Promise<{ tab: Page; token: string }> {
    const token = randomUUID();
    const tab = await browser.newPage();
    await tab.goto(`${server.origin}${path}?probe=${token}`);
    return { tab, token };
  }

  beforeAll(async () => {
    const engine: BrowserType | undefined = ENGINES[name];
    if (engine === undefined) throw new Error(`движок ${name}: нужен chromium, firefox или webkit`);
    browser = await engine.launch();
  });

  afterAll(async () => {
    await browser?.close();
  });

  it.each(Object.entries(PAGES))('%s: выполнилось только разрешённое', async (path, probe) => {
    const { tab } = await open(path);
    await expect.poll(() => marksOf(tab), POLL).toEqual(probe.marks);
    await pause();
    expect(await marksOf(tab)).toEqual(probe.marks);
    await tab.close();
  });

  it('обычная политика: ровно один отчёт — встроенный код без хеша; блок данных JSON — не нарушение', async () => {
    const { tab, token } = await open('/normal');
    await expect.poll(() => reportsFor(token).length, POLL).toBe(1);
    await pause();
    expect(reportsFor(token)).toHaveLength(1);
    await tab.close();
  });

  it('Report-Only: код выполнен, отчёт ушёл с disposition report (у WebKit поля нет)', async () => {
    const { tab, token } = await open('/report');
    await expect.poll(() => reportsFor(token).length, POLL).toBe(1);
    expect(reportsFor(token).map((report) => report.disposition ?? 'report')).toEqual(['report']);
    await tab.close();
  });
});
