import { errorText } from '../errors';
import type { ResaveCommand, ResaveDeps, ResaveReport } from './section';

// Все библиотечные секции разом (20.11, theme-release section --all): тот же resaveSection на каждую папку библиотеки
// по очереди. Наши версии — только из истории библиотеки (generated/library-history.json): git в образе сборщика нет.
// Выпуск — по секции; следующий ждёт в очереди, пока идёт предыдущий. Папка, не прошедшая проверку, не останавливает
// остальные — она в итоге с ошибкой.
export type AllCommand = Omit<ResaveCommand, 'folder'>;
type VersionsDeps = Pick<ResaveDeps, 'versions'>;
export type Resave<D extends VersionsDeps> = (deps: D, command: ResaveCommand) => Promise<ResaveReport>;

export interface FolderResult {
  folder: string;
  report: ResaveReport | null; // null — папку не удалось пройти, причина в error
  error?: string;
}

const noVersions = (): Promise<never[]> => Promise.resolve([]);

async function resaveFolder<D extends VersionsDeps>(
  deps: D,
  folder: string,
  command: AllCommand,
  resave: Resave<D>,
): Promise<FolderResult> {
  try {
    return { folder, report: await resave(deps, { ...command, folder }) };
  } catch (error) {
    return { folder, report: null, error: errorText(error) };
  }
}

export async function resaveAll<D extends VersionsDeps>(
  deps: D,
  folders: readonly string[],
  command: AllCommand,
  resave: Resave<D>,
  stopped: () => boolean = () => false,
): Promise<FolderResult[]> {
  const fromHistory: D = { ...deps, versions: noVersions };
  return folders.reduce<Promise<FolderResult[]>>(async (previous, folder) => {
    const done = await previous;
    return stopped() ? done : [...done, await resaveFolder(fromHistory, folder, command, resave)];
  }, Promise.resolve([]));
}

export interface AllTotals {
  folders: number; // папок библиотеки обойдено
  withCopies: number; // папок, у которых в магазинах темы есть копии
  updated: number;
  pending: number;
  already: number;
  changed: number; // правка мерчанта поверх нашей версии — пропуск
  other: number; // чужая секция с тем же именем и правка мерчанта на витрине — пропуск
  failed: number; // копии с ошибкой плюс папки, не прошедшие проверку
}

const countOf = (report: ResaveReport, action: string): number =>
  report.shops.filter((shop) => shop.action === action).length;

const sum = (values: readonly number[]): number => values.reduce((total, value) => total + value, 0);

export function totalsOf(results: readonly FolderResult[]): AllTotals {
  const reports = results.flatMap(({ report }) => (report === null ? [] : [report]));
  const field = (pick: (report: ResaveReport) => number): number => sum(reports.map(pick));
  return {
    folders: results.length,
    withCopies: reports.filter((report) => report.shops.length > 0).length,
    updated: field((report) => report.counts.updated),
    pending: field((report) => report.counts.pending),
    already: field((report) => report.counts.already),
    changed: field((report) => countOf(report, 'changed')),
    other: field((report) => countOf(report, 'not-ours') + countOf(report, 'live-changed')),
    failed: field((report) => report.counts.failed) + results.filter(({ report }) => report === null).length,
  };
}

function folderLine({ folder, report, error }: FolderResult): string | null {
  if (report === null) return `${folder}: ошибка — ${error ?? 'неизвестно'}`;
  if (report.shops.length === 0) return null;
  const { counts } = report;
  const release = report.release === null ? '' : `, выпуск №${report.release.id} (${report.release.status})`;
  const parts = `обновится ${counts.updated}, ждут волны ${counts.pending}, уже на новой ${counts.already}`;
  return `${report.name}: ${parts}, changed ${countOf(report, 'changed')}, прочих пропусков ${countOf(report, 'not-ours') + countOf(report, 'live-changed')}, упало ${counts.failed}${release}`;
}

// Отчёт: строка на секцию с копиями, итог, последней строкой JSON { write, totals }.
export function allLines(results: readonly FolderResult[], write: boolean): string[] {
  const totals = totalsOf(results);
  const mode = write ? 'запись' : 'сухой прогон — ничего не записано, запись — --write';
  const lines = results.map((result) => folderLine(result)).filter((line): line is string => line !== null);
  const total = `папок ${totals.folders}, с копиями ${totals.withCopies}: обновится ${totals.updated}, ждут волны ${totals.pending}, уже на новой ${totals.already}, changed ${totals.changed}, прочих пропусков ${totals.other}, упало ${totals.failed}`;
  return [`все библиотечные секции: ${mode}`, ...lines, total, JSON.stringify({ write, totals })];
}
