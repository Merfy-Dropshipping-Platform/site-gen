import traverseImport, { type NodePath } from '@babel/traverse';
import type { Node } from '@babel/types';
import type { Position } from './position';

// Обход дерева @babel/traverse для проверки скрипта секции (script-check.ts, script-facts.ts). Пакет — CommonJS: при
// импорте из ESM в Node default — объект модуля с полем default, в Vitest — сама функция.
export const SHELL_MODULE = '@merfy/shell';

const isTraverse = (value: unknown): value is typeof traverseImport => typeof value === 'function';

function failTraverse(): typeof traverseImport {
  throw new Error('в @babel/traverse нет функции обхода');
}

// Функция обхода: сам импорт или его поле default (CommonJS-interop), иначе — отказ.
const imported: unknown = traverseImport;
const candidates: readonly unknown[] = [imported, Reflect.get(Object(imported), 'default')];
const found = candidates.find(isTraverse);
export const traverse = found === undefined ? failTraverse() : found;

// Оператор import из @merfy/shell.
export const isShellImport = (path: NodePath | null): boolean =>
  path !== null && path.isImportDeclaration() && path.node.source.value === SHELL_MODULE;

// Имя поля, если оно написано в коде: x.name, x['name'], { name: … }; вычисляемое из выражения — null.
export function staticKey(node: Node, computed: boolean): string | null {
  if (!computed && node.type === 'Identifier') return node.name;
  return node.type === 'StringLiteral' ? node.value : null;
}

// Место узла: строка и колонка с 1, как в редакторе (у Babel колонка с 0).
export const placeOf = (node: Node): Position | undefined =>
  node.loc === null || node.loc === undefined
    ? undefined
    : { line: node.loc.start.line, column: node.loc.start.column + 1 };
