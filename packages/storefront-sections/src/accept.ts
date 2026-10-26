import { hashOf, sha256 } from '@merfy/storefront-build';
import { blobKey, contentTypeOf, type ObjectStore } from '@merfy/storefront-storage';
import { doorFields, type Door, type DoorFields } from './doors';
import { MANIFEST_FILE, readManifest, type SectionFiles } from './format';
import type { PreparedSection } from './prepare';
import { problem, type SectionProblem } from './problems';
import {
  currentDraft,
  findRelease,
  insertRelease,
  RoleTakenError,
  saveDraft,
  type Database,
  type NewSection,
  type SectionRow,
} from './registry';
import { DEFAULT_SANDBOX, prepareInWorker, type SandboxOptions } from './sandbox';

// Приём секции целиком (design.md блока 7, п. 21: «Все двери зовут одну функцию приёма в sites: разбор section.json,
// проверка, сборка, запись версии в реестр»). Дверь даёт автора, приставку и выпуск, дальше путь один: отпечаток
// исходника → знакомая строка — «без изменений», без сборки → сборка в отдельном процессе (sandbox.ts) → файл скрипта в
// storefront/blobs по sha256 (С7-10 Б) → строка реестра. Выпуск неизменен: та же версия с другим исходником — отказ
// release-changed («номер — подпись выпуска автора», С7-20 Б). Своя секция: другой исходник — новая текущая правка.
export interface AcceptDeps {
  db: Database;
  store: ObjectStore;
  sandbox?: SandboxOptions;
}

// Условие сохранения своей секции (часть 15з, Р15з-2): текущая правка магазина — с этим хешем исходника (null —
// секции нет), иначе DraftChangedError таблицы секций, ничего не записано. У выпуска расширения условия нет.
export interface AcceptOptions {
  expectDraft?: string | null;
}

export type AcceptResult =
  | { status: 'accepted'; row: SectionRow }
  | { status: 'unchanged'; row: SectionRow }
  | { status: 'refused'; problems: SectionProblem[] };

// Тип содержимого файла скрипта — как у модуля в сборке магазина (storefront-storage, content-types.ts).
const MODULE_FILE = 'section.js';

const refused = (problems: SectionProblem[]): AcceptResult => ({ status: 'refused', problems });

// Как дверь хранит правку: выпуск — неизменная строка с версией; своя секция — новая текущая строка.
interface Storage {
  find: (db: Database, door: DoorFields, name: string) => Promise<SectionRow | null>;
  // Строка с этим именем уже есть: ответ приёма или null — принимать как новую правку.
  known: (row: SectionRow, sourceHash: string) => AcceptResult | null;
  save: (db: Database, row: NewSection, options: AcceptOptions) => Promise<AcceptResult>;
}

function knownRelease(row: SectionRow, sourceHash: string): AcceptResult {
  if (row.sourceHash === sourceHash) return { status: 'unchanged', row };
  const text = `выпуск ${row.release ?? ''} уже принят с другим исходником: новая версия — новый номер выпуска`;
  return refused([problem('release-changed', '', text)]);
}

// Два сборщика стартовали разом и приняли один выпуск: строка — у первого, второй сверяет свой исходник с ней.
async function saveRelease(db: Database, row: NewSection): Promise<AcceptResult> {
  const inserted = await insertRelease(db, row);
  if (inserted !== null) return { status: 'accepted', row: inserted };
  const existing = await findRelease(db, row.door, row.section.name);
  if (existing === null) throw new Error(`выпуск ${row.section.name} не записан и не найден`);
  return knownRelease(existing, row.sourceHash);
}

const RELEASE: Storage = {
  find: (db, door, name) => findRelease(db, door, name),
  known: knownRelease,
  save: saveRelease,
};

const DRAFT: Storage = {
  find: (db, door, name) => currentDraft(db, door.owner, name),
  known: (row, sourceHash) => (row.sourceHash === sourceHash ? { status: 'unchanged', row } : null),
  save: async (db, row, options) => {
    try {
      const saved = await saveDraft(db, row, options.expectDraft);
      return { status: saved.created ? 'accepted' : 'unchanged', row: saved.row };
    } catch (error) {
      // Блок 12, часть 12а: роль занята другой секцией магазина — отказ приёма с её именем.
      if (!(error instanceof RoleTakenError)) throw error;
      const text = `в магазине уже есть секция с ролью ${error.role} — ${error.holder}, измени её`;
      return refused([problem('role-taken', MANIFEST_FILE, text)]);
    }
  },
};

const storageOf = (door: DoorFields): Storage => (door.release === null ? DRAFT : RELEASE);

// Файл скрипта — в storefront/blobs по sha256, как файлы сборок (С7-10 Б): превью и сборка берут его по отпечатку.
async function uploadScript(store: ObjectStore, script: string | null): Promise<string | null> {
  if (script === null) return null;
  const body = Buffer.from(script, 'utf8');
  const hash = sha256(body);
  if (!(await store.has(blobKey(hash))))
    await store.write(blobKey(hash), body, { contentType: contentTypeOf(MODULE_FILE) });
  return hash;
}

// Порядок ключей tokens из section.json (блок 4а): jsonb хранит ключи объекта отсортированными, поэтому порядок
// имён сохраняется рядом со строкой (колонка token_order). Берётся из исходного файла, а не из разобранного
// манифеста: путь через воркер и схемы не должен влиять на порядок. Нет ключа tokens — null.
function tokenOrderOf(files: SectionFiles): string[] | null {
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  try {
    const manifest: unknown = JSON.parse(files[MANIFEST_FILE] ?? '');
    if (!isRecord(manifest)) return null;
    const tokens: unknown = manifest.tokens;
    if (!isRecord(tokens)) return null;
    return Object.keys(tokens);
  } catch {
    return null;
  }
}

export function newRow(
  door: DoorFields,
  section: PreparedSection,
  files: SectionFiles,
  scriptHash: string | null,
): NewSection {
  const { name, manifest, template } = section;
  const contentHash = hashOf({ name, manifest, template, script: scriptHash });
  // Отпечаток модуля рендера — sha256 его байтов; у глобального скрипта модуля нет — null.
  const renderHash = section.render === null ? null : sha256(Buffer.from(section.render, 'utf8'));
  return {
    door,
    section,
    sourceHash: hashOf(files),
    contentHash,
    renderHash,
    scriptHash,
    source: files,
    tokenOrder: tokenOrderOf(files),
  };
}

export async function acceptSection(
  deps: AcceptDeps,
  door: Door,
  files: SectionFiles,
  options: AcceptOptions = {},
): Promise<AcceptResult> {
  const fields = doorFields(door);
  const manifest = readManifest(files);
  if (!manifest.ok) return refused(manifest.problems);
  const storage = storageOf(fields);
  const known = await storage.find(deps.db, fields, `${fields.prefix}:${manifest.value.name}`);
  const answer = known === null ? null : storage.known(known, hashOf(files));
  if (answer !== null) return answer;
  const prepared = await prepareInWorker({ prefix: fields.prefix, files }, deps.sandbox ?? DEFAULT_SANDBOX);
  if (!prepared.ok) return refused(prepared.problems);
  const scriptHash = await uploadScript(deps.store, prepared.section.script);
  return storage.save(deps.db, newRow(fields, prepared.section, files, scriptHash), options);
}
