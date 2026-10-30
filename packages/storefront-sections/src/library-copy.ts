import { createHash } from 'node:crypto';
import libraryIndex from '../generated/library-index.json';
import { MANIFEST_FILE, type SectionFiles } from './format';
import { problem, type SectionProblem } from './problems';

// Копия библиотечной секции без изменений (Н-«Оценка владельца» после «Лавренти», 30.10): секция нашей библиотеки,
// взятая под другим именем и не тронутая, — это та же секция с лишним названием: вид и параметры прежние, а
// агент считает, что переделал. Предупреждение просит поставить библиотечную как есть или изменить. Сверка — по
// отпечатку файлов без name и title; отпечатки библиотеки лежат в generated/library-index.json (pnpm generate),
// читать диск проверка не может — она идёт в процессе без доступа к файлам.
export type LibraryIndex = Readonly<Record<string, string>>; // отпечаток → имя библиотечной секции

const INDEX: LibraryIndex = libraryIndex;
const IGNORED_KEYS: ReadonlySet<string> = new Set(['name', 'title']);

const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(canonical);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => (left < right ? -1 : 1))
      .map(([key, item]) => [key, canonical(item)]),
  );
};

const plain = (text: string): string =>
  text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .trim();

// Отпечаток секции: section.json без name и title (ключи по алфавиту) и остальные файлы по путям. Не разобралось — null.
export function libraryKeyOf(files: SectionFiles): string | null {
  const raw = files[MANIFEST_FILE];
  if (raw === undefined) return null;
  let manifest: unknown;
  try {
    manifest = JSON.parse(raw);
  } catch {
    return null;
  }
  if (typeof manifest !== 'object' || manifest === null || Array.isArray(manifest)) return null;
  const kept = Object.fromEntries(Object.entries(manifest).filter(([key]) => !IGNORED_KEYS.has(key)));
  const others = Object.keys(files)
    .filter((path) => path !== MANIFEST_FILE)
    .sort()
    .map((path) => [path, plain(files[path] ?? '')]);
  return createHash('sha256')
    .update(JSON.stringify([canonical(kept), others]))
    .digest('hex');
}

export function libraryCopyProblems(files: SectionFiles, name: string, index: LibraryIndex = INDEX): SectionProblem[] {
  const key = libraryKeyOf(files);
  const library = key === null ? undefined : index[key];
  if (library === undefined || library === name) return [];
  const message = `секция — копия библиотечной \`${library}\` без изменений, только под другим именем \`${name}\`. Поставь библиотечную \`${library}\` как есть или измени копию: параметры, разметку, вид`;
  return [problem('taste-library-copy', MANIFEST_FILE, message)];
}
