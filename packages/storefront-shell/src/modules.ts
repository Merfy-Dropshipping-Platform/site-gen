import { ShellError } from './errors';

// Список модулей страницы (design.md блока 7, С7-7 Г): сборка пишет его в <head> тегом
// <script type="application/json" id="merfy-modules">. Строка section — скрипт секции, которая стоит на странице;
// global — глобальный скрипт (С7-21 А): секция без места. Имя — с приставкой автора (п. 22), адрес — от корня сайта
// или полный (превью). Без zod: ядро маленькое (С-3 Б), полную проверку сделала сборка.
export const MODULES_TAG_ID = 'merfy-modules';
const KNOWN_VERSION = 1;
const SECTION_NAME = /^[a-z0-9]+(?:-[a-z0-9]+)*:[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MODULE_SRC = /^(?:\/|https?:\/\/)/;

export type ModuleKind = 'section' | 'global';

export interface ModuleEntry {
  kind: ModuleKind;
  name: string;
  src: string;
}

// Где искать тег: обычно document; тесту хватает любого объекта с getElementById.
export type ModulesSource = { getElementById(id: string): { textContent: string | null } | null };

const MODULE_KINDS: Record<ModuleKind, true> = { section: true, global: true };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isKind = (value: unknown): value is ModuleKind => typeof value === 'string' && Object.hasOwn(MODULE_KINDS, value);
const matches = (value: unknown, pattern: RegExp): boolean => typeof value === 'string' && pattern.test(value);

export function isModuleEntry(value: unknown): value is ModuleEntry {
  if (!isRecord(value)) return false;
  return isKind(value.kind) && matches(value.name, SECTION_NAME) && matches(value.src, MODULE_SRC);
}

function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ShellError('modules-invalid', 'в теге не JSON', { path: `#${MODULES_TAG_ID}`, cause: error });
  }
}

// Тега нет — у страницы нет модулей. Битая строка — ошибка с её номером: сборка такого не пишет, значит, страницу
// правили руками.
export function readModuleList(doc: ModulesSource): ModuleEntry[] {
  const tag = doc.getElementById(MODULES_TAG_ID);
  if (tag === null) return [];
  const value = parseJson(tag.textContent ?? '');
  const modules = isRecord(value) && value.v === KNOWN_VERSION ? value.modules : undefined;
  if (!Array.isArray(modules))
    throw new ShellError('modules-invalid', `нужно { "v": ${KNOWN_VERSION}, "modules": [...] }`, {
      path: `#${MODULES_TAG_ID}`,
    });
  const bad = modules.findIndex((entry) => !isModuleEntry(entry));
  if (bad !== -1)
    throw new ShellError('modules-invalid', 'строке нужны kind (section или global), name с приставкой и src', {
      path: `#${MODULES_TAG_ID}.modules.${bad}`,
    });
  return modules.filter(isModuleEntry);
}
