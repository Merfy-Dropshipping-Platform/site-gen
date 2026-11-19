import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageFiles } from '../src/generate/files';
import { gitSectionVersions } from '../src/generate/git-versions';
import {
  LIBRARY_HISTORY_PATH,
  libraryHistoryOf,
  libraryHistoryText,
  parseLibraryHistory,
} from '../src/generate/library-history';
import { LIBRARY_INDEX_PATH, libraryIndexOf, libraryIndexText } from '../src/generate/library-index';

// pnpm generate — файлы пакета в generated/ (блок 3 «Секций и SDK», Р3.13). Список сквозных настроек — из панели темы
// платформы; сам src панель не импортирует (Р3.4).
const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL_PATH = join(PACKAGE_DIR, '../theme-contract/panel/theme-panel.json');

// Нет git или клон не репозиторий — версий из git нет, история пополняется только текущими папками.
async function versionsOrNone(folder: string): ReturnType<typeof gitSectionVersions> {
  try {
    return await gitSectionVersions(folder);
  } catch (error) {
    process.stderr.write(`git недоступен для ${folder}: ${error instanceof Error ? error.message : String(error)}\n`);
    return [];
  }
}

try {
  const raw: unknown = JSON.parse(readFileSync(PANEL_PATH, 'utf8'));
  for (const [path, text] of Object.entries(packageFiles(raw))) {
    const target = join(PACKAGE_DIR, path);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, text);
    process.stdout.write(`записан ${target}\n`);
  }
  // Отпечатки библиотечных секций (library-copy.ts): читают папки секций, поэтому отдельно от packageFiles.
  const libraryTarget = join(PACKAGE_DIR, LIBRARY_INDEX_PATH);
  writeFileSync(libraryTarget, libraryIndexText(await libraryIndexOf(PACKAGE_DIR)));
  process.stdout.write(`записан ${libraryTarget}\n`);
  // История версий библиотеки: прежний файл + git + текущие папки; файл только пополняется.
  const historyTarget = join(PACKAGE_DIR, LIBRARY_HISTORY_PATH);
  const previous = parseLibraryHistory(readFileSync(historyTarget, 'utf8'));
  writeFileSync(historyTarget, libraryHistoryText(await libraryHistoryOf(PACKAGE_DIR, previous, versionsOrNone)));
  process.stdout.write(`записан ${historyTarget}\n`);
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
