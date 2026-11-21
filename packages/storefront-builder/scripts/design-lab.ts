import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { capture } from '../src/design/design-capture';
import { DesignGuard } from '../src/design/design-guard';
import { labHtml, labSite, parseSites, summaryLine, type LabSite } from '../src/design/lab';
import { OUTLINE_TOOLS, STYLE_TOOLS, outlineChain, styleChain } from '../src/design/registry';

// Стенд «Дизайна по ссылке»: `pnpm --filter @merfy/storefront-builder design-lab <url…> | --sites <файл> --out <папка>`.
// Все подключённые переходники на каждом сайте, по одному сайту за раз (как DESIGN_SLOTS=1 в проде), отчёт —
// <папка>/report.html и report.json. Список эталонных сайтов — bench/design/sites.txt. Фильтр адресов тот же, что у
// задания; браузер — Chromium из Playwright пакета.

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    sites: { type: 'string' },
    out: { type: 'string', default: 'design-lab-out' },
    budget: { type: 'string', default: '90000' },
  },
});

const listed = values.sites === undefined ? [] : parseSites(await readFile(resolve(values.sites), 'utf8'));
const urls = [...positionals, ...listed];
if (urls.length === 0) {
  process.stderr.write('нужны адреса сайтов или --sites <файл>\n');
  process.exit(2);
}

const out = resolve(values.out);
await mkdir(out, { recursive: true });
const guard = DesignGuard.fromEnv(process.env);
const deps = {
  capture: (url: string) => capture({ guard }, url),
  style: Object.values(STYLE_TOOLS),
  outline: Object.values(OUTLINE_TOOLS),
  chainStyle: styleChain(process.env),
  chainOutline: outlineChain(process.env),
  now: () => Date.now(),
  budgetMs: Number(values.budget),
};

const startedAt = new Date().toISOString();
const sites: LabSite[] = [];
for (const url of urls) {
  const site = await labSite(deps, url);
  sites.push(site);
  process.stdout.write(`${summaryLine(site)}\n`);
}
const report = join(out, 'report.html');
await writeFile(report, labHtml(sites, startedAt));
await writeFile(
  join(out, 'report.json'),
  JSON.stringify(
    sites.map((site) => ({ ...site, screen: null })),
    null,
    1,
  ),
);
process.stdout.write(`отчёт: ${report}\n`);
