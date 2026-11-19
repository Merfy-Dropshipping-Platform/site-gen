import { hashOf } from '@merfy/storefront-build';
import libraryHistory from '../generated/library-history.json';
import type { SectionFiles } from './format';

// История библиотечных секций (20.11): каждая версия каждой секции платформы — по точному отпечатку файлов. Копия
// секции в магазине помнит ровно такой отпечаток (`storefront_section.source_hash` = hashOf(files)), поэтому «копия без
// правок мерчанта» — это отпечаток из истории, а не только из текущей версии библиотеки: после правки библиотеки
// старые копии остаются нашими и обновляются выпуском секции (`theme-release section`). Файл generated/library-history.json
// только пополняется (pnpm generate), тест-сторож требует в нём текущую версию каждой секции.
//
// Отпечаток один — точный `hashOf(files)`. Прежний `libraryKeyOf` (library-copy.ts) не различает название, имя и концевые
// пробелы: для подсказки «копия под другим именем» это нужно, а для решения, трогать ли копию магазина, — нельзя: копия с
// другим названием или переформатированная мерчантом при нём считалась бы нетронутой, и обновление затёрло бы его правку.
export interface LibraryVersion {
  name: string; // имя секции из section.json папки библиотеки
  version: number; // номер версии: 1 — самая старая из известных, дальше по порядку появления
}

export type LibraryHistory = Readonly<Record<string, LibraryVersion>>; // hashOf(files) → версия

const HISTORY: LibraryHistory = libraryHistory;

// Какая версия библиотеки у этих файлов; не из истории — undefined.
export function libraryVersionOf(files: SectionFiles, history: LibraryHistory = HISTORY): LibraryVersion | undefined {
  const hash = hashOf(files);
  return Object.hasOwn(history, hash) ? history[hash] : undefined;
}

// Секция осталась библиотечной (19.11): её файлы — любая версия из истории, под тем же именем и названием. Правка кода,
// разметки, параметров, названия — отпечаток другой, секция уже авторская: её находки чинит агент, а не платформа.
export function isLibrarySection(files: SectionFiles, history: LibraryHistory = HISTORY): boolean {
  return libraryVersionOf(files, history) !== undefined;
}

// Отпечатки всех версий секции по имени из section.json — «известные» для copyAction выпуска секции.
export function libraryHashesOf(name: string, history: LibraryHistory = HISTORY): ReadonlySet<string> {
  return new Set(
    Object.entries(history)
      .filter(([, version]) => version.name === name)
      .map(([hash]) => hash),
  );
}
