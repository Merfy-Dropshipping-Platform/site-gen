import { acceptSection, type AcceptDeps, type AcceptResult } from './accept';
import type { Door } from './doors';
import { problemText } from './problems';
import { listSectionFolders, readSectionFolder } from './read-folder';

// Дверь выпуска (design.md блока 7, п. 21): секции платформы и тем входят при выпуске — сборщик при старте отдаёт
// функции приёма папку секций платформы (выпуск — версия ядра @merfy/shell) и каждой своей темы (выпуск — версия темы).
// Принятое раньше — «без изменений», без сборки. Отказ — строка журнала section-refused: секции нет в реестре, магазины
// собираются без неё (п. 24), остальные секции принимаются. По одной: процесс сборки секции тяжёлый.
export type ReleaseLog = (message: string, fields?: Readonly<Record<string, string | number | boolean | null>>) => void;

export interface ReleaseFolder {
  door: Door;
  // Папка, где каждая подпапка — секция.
  root: string;
}

export interface ReleaseSummary {
  accepted: number;
  unchanged: number;
  refused: number;
}

export interface ReleaseDeps extends AcceptDeps {
  log: ReleaseLog;
}

function logResult(log: ReleaseLog, folder: string, result: AcceptResult): void {
  if (result.status === 'refused') {
    log('section-refused', { folder, problems: result.problems.map(problemText).join('; ') });
    return;
  }
  const { name, release, contentHash } = result.row;
  log('section-release', { name, release, status: result.status, contentHash });
}

export async function acceptReleases(deps: ReleaseDeps, folders: readonly ReleaseFolder[]): Promise<ReleaseSummary> {
  const summary: ReleaseSummary = { accepted: 0, unchanged: 0, refused: 0 };
  for (const folder of folders) {
    for (const dir of await listSectionFolders(folder.root)) {
      const result = await acceptSection(deps, folder.door, await readSectionFolder(dir));
      logResult(deps.log, dir, result);
      summary[result.status] += 1;
    }
  }
  return summary;
}
