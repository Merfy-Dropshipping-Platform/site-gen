// Удаление export-деклараций из `index.ts` темы блока через TS AST.
//
// Используется в migrate-block-to-tokens.mjs после удаления файлов
// `<Блок>.classes.ts` / `<Блок>.tokens.ts`, чтобы оставшиеся
// `export { HeaderClasses } from './Header.classes';` не давали
// ENOENT при загрузке `index.mjs` через ThemePuckConfigController.
//
// Подход: TS AST находит ExportDeclaration с module specifier, который
// в результате резолва указывает на удалённый файл. Удаляем такие
// декларации построчно (range узла) с захватом ведущих whitespace.
//
// Возвращает:
//   - text: новый текст файла (может быть null если стал пустой)
//   - removedCount: сколько деклараций удалено
//   - removedDecls: список удалённых модулей (`./Header.tokens`)
//   - shouldDelete: true если после удаления файл «пустой» (нет export'ов)

import { createRequire } from 'node:module';
import path from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');

/**
 * Получить из ExportDeclaration строку module specifier (без кавычек).
 * Возвращает null если specifier не строковый литерал.
 */
function getModuleSpecifierText(node) {
  if (!node.moduleSpecifier) return null;
  if (!ts.isStringLiteral(node.moduleSpecifier)) return null;
  return node.moduleSpecifier.text;
}

/**
 * Нормализовать module specifier (`./Header.tokens`) к имени файла без расширения
 * относительно директории `dirOfIndex`. Возвращает absolute путь без расширения.
 *
 * Примеры:
 *   './Header.tokens' → /abs/.../Header.tokens
 *   './Header.classes' → /abs/.../Header.classes
 */
function resolveSpecifier(spec, dirOfIndex) {
  // Только relative specs учитываем (./, ../). Bare specs (package'и) пропускаем.
  if (!spec.startsWith('./') && !spec.startsWith('../')) return null;
  // Уберём расширение из specifier если оно есть (`.js`, `.ts`, `.mjs`)
  const cleaned = spec.replace(/\.(js|ts|mjs|tsx|jsx)$/, '');
  return path.resolve(dirOfIndex, cleaned);
}

/**
 * Удалить из `index.ts` все ExportDeclaration, чьи module specifiers
 * после резолва совпадают с одним из удалённых файлов.
 *
 * @param {string} sourceText  — содержимое `index.ts`
 * @param {string[]} deletedFiles — abs пути файлов, которые были удалены
 *                                  (например `/abs/.../Header.tokens.ts`)
 * @param {string} indexFilePath — abs путь к `index.ts` (нужен для резолва специфаеров)
 * @returns {{ text: string|null, removedCount: number, removedDecls: string[], shouldDelete: boolean }}
 */
export function removeDeletedExports(sourceText, deletedFiles, indexFilePath) {
  if (typeof sourceText !== 'string') {
    throw new TypeError('removeDeletedExports: sourceText должен быть строкой');
  }
  if (!Array.isArray(deletedFiles)) {
    throw new TypeError('removeDeletedExports: deletedFiles должен быть массивом путей');
  }

  // Нормализуем удалённые файлы → абсолютные пути без расширения, в Set
  const dirOfIndex = path.dirname(indexFilePath);
  const deletedWithoutExt = new Set();
  for (const f of deletedFiles) {
    const abs = path.isAbsolute(f) ? f : path.resolve(dirOfIndex, f);
    const withoutExt = abs.replace(/\.(js|ts|mjs|tsx|jsx)$/, '');
    deletedWithoutExt.add(withoutExt);
  }

  const sf = ts.createSourceFile(
    path.basename(indexFilePath),
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );

  // Собираем диапазоны строк, которые нужно удалить (по top-level ExportDeclaration)
  const ranges = []; // { start, end, spec }
  const removedDecls = [];

  for (const statement of sf.statements) {
    if (!ts.isExportDeclaration(statement)) continue;
    const spec = getModuleSpecifierText(statement);
    if (!spec) continue; // `export {};` без module — оставляем
    const resolved = resolveSpecifier(spec, dirOfIndex);
    if (resolved === null) continue; // bare spec, не наш
    if (!deletedWithoutExt.has(resolved)) continue;

    // Найдём range всей декларации с учётом leading trivia (комментарии/whitespace перед statement)
    // Но НЕ захватываем целую строку выше — только trivia напрямую прилегающую к statement.
    // Безопаснее: захватим от getFullStart() до getEnd(), а потом съедим один trailing newline.
    const fullStart = statement.getFullStart();
    let end = statement.getEnd();
    // Захватываем trailing newline если он есть и не последний символ файла (для аккуратности)
    if (sourceText[end] === '\n') end += 1;
    else if (sourceText[end] === '\r' && sourceText[end + 1] === '\n') end += 2;

    ranges.push({ start: fullStart, end });
    removedDecls.push(spec);
  }

  if (ranges.length === 0) {
    // Ничего не удаляем
    const hasAnyExport = sf.statements.some((s) => ts.isExportDeclaration(s) || ts.isExportAssignment(s));
    return {
      text: sourceText,
      removedCount: 0,
      removedDecls: [],
      shouldDelete: !hasAnyExport && sourceText.trim().length === 0,
    };
  }

  // Сортируем по start (от меньшего к большему) и собираем новый текст
  ranges.sort((a, b) => a.start - b.start);
  const chunks = [];
  let cursor = 0;
  for (const r of ranges) {
    chunks.push(sourceText.slice(cursor, r.start));
    cursor = r.end;
  }
  chunks.push(sourceText.slice(cursor));
  let result = chunks.join('');

  // Сжать множественные подряд пустые строки в одну
  result = result.replace(/\n{3,}/g, '\n\n');

  // Проверяем: есть ли в результате хоть один export?
  // Парсим повторно для надёжности.
  const sf2 = ts.createSourceFile(
    path.basename(indexFilePath),
    result,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const remainingExports = sf2.statements.filter(
    (s) => ts.isExportDeclaration(s) || ts.isExportAssignment(s),
  );

  // Если экспортов нет И в файле остался только whitespace/комментарии → удалить файл
  const trimmed = result.trim();
  const onlyCommentsOrEmpty =
    trimmed.length === 0 ||
    sf2.statements.length === 0;
  const shouldDelete = remainingExports.length === 0 && onlyCommentsOrEmpty;

  return {
    text: result,
    removedCount: ranges.length,
    removedDecls,
    shouldDelete,
  };
}
