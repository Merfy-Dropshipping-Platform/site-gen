import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { packageFiles } from '../src/generate/files';
import { LIBRARY_INDEX_PATH, libraryIndexOf, libraryIndexText } from '../src/generate/library-index';

// pnpm generate — файлы пакета в generated/ (блок 3 «Секций и SDK», Р3.13). Список сквозных настроек — из панели темы
// платформы; сам src панель не импортирует (Р3.4).
const PACKAGE_DIR = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const PANEL_PATH = join(PACKAGE_DIR, '../theme-contract/panel/theme-panel.json');

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
} catch (error) {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
