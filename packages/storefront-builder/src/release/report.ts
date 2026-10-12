import type { Difference, Verdict } from '@merfy/stand-check';
import type { DryRun } from './dry-run';

// Отчёт выпуска темы (design.md блока 10, «Команда выпуска»): сухой прогон; тестовый магазин — вердикт ведущего волн и
// паспорт главной по правилам стенда; снимки со ссылками; следующие команды. Markdown: его читает человек перед «да».

export interface ShotLink {
  title: string;
  before: string | null;
  after: string | null;
  diff: string | null;
  ratio: number;
  threshold: number;
  over: boolean;
}

export interface ReleaseReport {
  release: number | null;
  theme: string;
  from: string;
  to: string;
  toHash: string;
  contour: string;
  status: string;
  dryRun: DryRun;
  testShop: string | null;
  conductorVerdict: string | null;
  passport: { verdict: Verdict; differences: Difference[] } | null;
  shots: ShotLink[] | null;
}

const RUN = 'pnpm --filter @merfy/storefront-builder theme-release';
const link = (url: string | null): string => (url === null ? '—' : `[открыть](${url})`);
const percent = (value: number): string => `${(value * 100).toFixed(1)} %`;
const severityText = (difference: Difference): string => (difference.severity === 'red' ? '**красный**' : 'жёлтый');

function dryRunLines(dry: DryRun): string[] {
  const red = dry.shops.filter((shop) => shop.problems.length > 0).length;
  const verdict = dry.red ? '**Сухой прогон красный — выпуск не стартует.**' : 'Сухой прогон чистый.';
  const shops = dry.shops.flatMap((shop) => [
    ...shop.problems.map((problem) => `- ${shop.siteId}: **${problem}**`),
    ...shop.declared.map((change) => `- ${shop.siteId}: ${change} (строка «вид»)`),
  ]);
  const version = dry.problems.map((problem) => `- версия: **${problem}**`);
  return [
    '## Сухой прогон',
    '',
    `Магазинов: ${dry.shops.length}; красных: ${red}. ${verdict}`,
    '',
    ...version,
    ...shops,
  ];
}

function testShopLines(report: ReleaseReport): string[] {
  if (report.testShop === null || report.passport === null) return [];
  const { verdict, differences } = report.passport;
  const items = differences.map(
    (difference) =>
      `- ${severityText(difference)} ${difference.field} ${difference.op} \`${difference.name}\` — ${difference.reason}`,
  );
  return [
    '',
    `## Тестовый магазин ${report.testShop}`,
    '',
    `Ведущий волн, паспорт «после» по правилам выпуска: ${report.conductorVerdict ?? 'вердикта нет'}.`,
    `Паспорт главной по правилам стенда: ${verdict}, отличий ${differences.length}.`,
    '',
    ...items,
  ];
}

function shotLines(report: ReleaseReport): string[] {
  if (report.testShop === null) return [];
  if (report.shots === null) return ['', '## Снимки', '', 'Снимки выключены (`--no-shots`).'];
  const rows = report.shots.map(
    (shot) =>
      `| ${shot.title} | ${link(shot.before)} | ${link(shot.after)} | ${link(shot.diff)} | ${percent(shot.ratio)} | ` +
      `${percent(shot.threshold)} | ${shot.over ? '**жёлтый: выше порога**' : 'в пороге'} |`,
  );
  return [
    '',
    '## Снимки',
    '',
    '| Страница | До | После | Отличия | Доля | Порог | Итог |',
    '|---|---|---|---|---|---|---|',
    ...rows,
  ];
}

function nextLines(report: ReleaseReport): string[] {
  if (report.release === null) return [];
  const id = report.release;
  return [
    '',
    '## Дальше',
    '',
    `- «да», волны 1–3: \`${RUN} approve ${id}\``,
    `- вернуть всех: \`${RUN} revert-all ${id}\``,
    `- состояние: \`${RUN} status ${id}\``,
  ];
}

export function renderReleaseReport(report: ReleaseReport): string {
  const number = report.release === null ? '' : `, №${report.release}`;
  return [
    `# Выпуск ${report.theme} ${report.from} → ${report.to}${number} (${report.contour})`,
    '',
    `Отпечаток версии: \`${report.toHash}\`. Состояние: ${report.status}.`,
    '',
    ...dryRunLines(report.dryRun),
    ...testShopLines(report),
    ...shotLines(report),
    ...nextLines(report),
    '',
  ].join('\n');
}
