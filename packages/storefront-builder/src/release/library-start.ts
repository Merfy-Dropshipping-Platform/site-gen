import { libraryFolders, readSectionFolder } from '@merfy/storefront-sections';
import type { ObjectStore } from '@merfy/storefront-storage';
import { errorText } from '../errors';
import type { Log } from '../log';
import type { Database } from '../shop-state';
import { resaveSection, type ResaveDeps } from './section';
import { resaveAll, totalsOf, type AllTotals, type FolderResult, type Resave } from './section-all';

// Автозапуск выпуска библиотечных секций при старте сборщика после выкатки (20.11): новые версии секций платформы
// доходят до копий магазинов без ручного `theme-release section --all --write`. Работа — та же, что у команды: версии
// из истории библиотеки, копия, тронутая мерчантом, — пропуск, выпуск на секцию волнами (тестовый магазин → 10 % → 50 %
// → все). Выключается STORE_LIBRARY_RELEASE_ENABLED (по умолчанию выключен); на проде у выпуска секции после тестового
// магазина ждёт «да» (kinds.ts, needsApproval).
//
// Не держит старт: идёт после LIBRARY_RELEASE_DELAY_MS, когда ведущий уже подписан и выпуск платформы заведён — выпуски
// секций встают за ним в очередь. Идемпотентно: копии на новой версии — `already`, выпуска нет. Сбой папки и темы
// проход не валит.
export const LIBRARY_RELEASE_DELAY_MS = 60_000;
const STARTED_BY = 'builder';

export interface LibraryRelease {
  db: Database;
  store: ObjectStore;
  contour: 'dev' | 'prod';
  themeIds: readonly string[];
  testShop: string | null;
  folders: () => Promise<string[]>; // папки библиотеки — libraryFolders
  log: Log;
  resave?: Resave<ResaveDeps>; // подставляют тесты
  stopped?: () => boolean;
}

function resaveDeps(deps: LibraryRelease): ResaveDeps {
  const { db, store, contour, log } = deps;
  return {
    db,
    store,
    contour,
    startedBy: STARTED_BY,
    say: (line) => log('library-release-line', { line }),
    read: readSectionFolder,
    versions: () => Promise.resolve([]),
  };
}

async function releaseTheme(deps: LibraryRelease, themeId: string): Promise<FolderResult[]> {
  const command = { write: true, testShop: deps.testShop, theme: themeId };
  const results = await resaveAll(
    resaveDeps(deps),
    await deps.folders(),
    command,
    deps.resave ?? resaveSection,
    deps.stopped,
  );
  deps.log('library-release', { themeId, ...totalsOf(results) });
  results.forEach(({ folder, error }) => {
    if (error !== undefined) deps.log('library-release-folder-failed', { folder, error });
  });
  return results;
}

// Один проход по темам образа. Итог — по темам; тема, на которой проход упал, в итоге отсутствует (причина в журнале).
export async function runLibraryRelease(deps: LibraryRelease): Promise<Map<string, AllTotals>> {
  const done = new Map<string, AllTotals>();
  for (const themeId of deps.themeIds) {
    if (deps.stopped?.() === true) break;
    try {
      done.set(themeId, totalsOf(await releaseTheme(deps, themeId)));
    } catch (error) {
      deps.log('library-release-failed', { themeId, error: errorText(error) });
    }
  }
  return done;
}

export interface LibraryReleaseSchedule extends Omit<LibraryRelease, 'folders' | 'stopped'> {
  enabled: boolean;
  packageDir: string; // каталог пакета storefront-sections
  delayMs?: number;
}

// Запуск после старта; выключен — строка в журнале и ничего больше. stop() снимает ожидание и не даёт начать следующую
// папку идущему проходу.
export function scheduleLibraryRelease(schedule: LibraryReleaseSchedule): { stop: () => void } {
  const { log, enabled, packageDir, delayMs = LIBRARY_RELEASE_DELAY_MS, ...rest } = schedule;
  let stopped = false;
  if (!enabled) {
    log('library-release-disabled', { flag: 'STORE_LIBRARY_RELEASE_ENABLED' });
    return { stop: () => undefined };
  }
  const timer = setTimeout(() => {
    void runLibraryRelease({ ...rest, log, folders: () => libraryFolders(packageDir), stopped: () => stopped });
  }, delayMs);
  timer.unref();
  return {
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
