import { parse } from '@babel/parser';
import type { Binding, NodePath, Visitor } from '@babel/traverse';
import type { File, Identifier, Node, ObjectExpression, Statement } from '@babel/types';
import type { SectionFiles } from './format';
import { problem, type SectionProblem } from './problems';
import { fileFacts, mergeFacts, type FileFacts, type ScriptFacts } from './script-facts';
import {
  CALL_GLOBALS,
  FORBIDDEN_FIELDS,
  MEMBER_GLOBALS,
  NEW_GLOBALS,
  NEW_INTL,
  SDK_TEXT,
  VALUE_GLOBALS,
} from './script-sdk';
import { SHELL_MODULE, isShellImport, placeOf, staticKey, traverse } from './script-tree';

// Проверка исходника скрипта секции при сохранении (design.md блока 5, разделы 3.1 и 3.9; 15 Г). Каждый файл .ts/.js
// секции разбирает @babel/parser, области видимости — @babel/traverse; код секции не выполняется. «Только SDK»:
// свободное имя вне списка script-sdk.ts, this, class, delete, import(), import.meta, declare, enum, namespace, служебные
// поля JS, a[k] += …, исполняемый код вне defineSection — sdk-only; export default не defineSection({ … }) —
// script-invalid. Факты для сверки имён и script_meta собирает script-facts.ts.
export const SERVICE_PREFIX = '__merfy';
const SCRIPT_FILE = /\.(?:ts|js)$/;
const RELATIVE = /^\.\.?\//;
const DEFINE = 'defineSection';
// TS-узлы, у которых поле expression — значение, а не тип: x as T, x!, x satisfies T, <T>x, f<T>.
const VALUE_TS: ReadonlySet<string> = new Set([
  'TSAsExpression',
  'TSSatisfiesExpression',
  'TSNonNullExpression',
  'TSTypeAssertion',
  'TSInstantiationExpression',
]);
const TYPE_STATEMENTS: ReadonlySet<string> = new Set(['TSTypeAliasDeclaration', 'TSInterfaceDeclaration']);
// declare, enum, namespace, import x = require(), export =: за объявлением прячется имя страницы или код вне
// defineSection. Отвергает обход (visitorOf), верхний уровень их пропускает — одна ошибка на место.
const DECLARE_TYPES =
  'TSDeclareFunction|TSEnumDeclaration|TSModuleDeclaration|TSImportEqualsDeclaration|TSExportAssignment';
const DECLARE_NODES: ReadonlySet<string> = new Set(DECLARE_TYPES.split('|'));

export interface ScriptCheck {
  problems: SectionProblem[];
  // false — файл не разобрался (script-invalid с местом): сборку esbuild не запускаем.
  parsed: boolean;
  facts: ScriptFacts;
}

interface FileState {
  file: string;
  entry: boolean;
  problems: SectionProblem[];
  definition: NodePath<ObjectExpression> | null;
}

type Code = 'sdk-only' | 'script-invalid';

function report(state: FileState, node: Node, message: string, code: Code = 'sdk-only'): void {
  state.problems.push(problem(code, state.file, message, placeOf(node)));
}

// Ошибка синтаксиса — script-invalid с местом (строка и колонка с 1), текст без «(строка:колонка)» в конце.
function parseFailure(file: string, error: unknown): SectionProblem {
  const loc: unknown = Reflect.get(Object(error), 'loc');
  const line = Number(Reflect.get(Object(loc), 'line'));
  const column = Number(Reflect.get(Object(loc), 'column'));
  const at = Number.isInteger(line) && Number.isInteger(column) ? { line, column: column + 1 } : undefined;
  const message = error instanceof Error ? error.message.replace(/\s*\(\d+:\d+\)$/, '') : String(error);
  return problem('script-invalid', file, message, at);
}

function parseFile(file: string, text: string): { ast: File } | { failure: SectionProblem } {
  try {
    const plugins: 'typescript'[] = file.endsWith('.ts') ? ['typescript'] : [];
    return { ast: parse(text, { sourceType: 'module', plugins, attachComment: false }) };
  } catch (error) {
    return { failure: parseFailure(file, error) };
  }
}

// Идентификатор в типе (State, Ctx<State>, ключ interface) — не значение: его не проверяем.
function inTypePosition(path: NodePath): boolean {
  const parent = path.parentPath;
  if (parent === null) return false;
  return parent.node.type.startsWith('TS') && !(VALUE_TS.has(parent.node.type) && path.key === 'expression');
}

// Привязка-значение. Импорт только типа (import type, { type X }) — kind unknown: кодом он не становится, esbuild его
// убирает, поэтому такое имя в значении — свободное имя страницы.
function valueBinding(path: NodePath<Identifier>): Binding | undefined {
  const binding = path.scope.getBinding(path.node.name);
  return binding === undefined || binding.kind === 'unknown' ? undefined : binding;
}

function isDefineBinding(binding: Binding | undefined): boolean {
  const specifier = binding?.path;
  if (binding?.kind !== 'module' || specifier === undefined || !specifier.isImportSpecifier()) return false;
  const imported = specifier.node.imported;
  const name = imported.type === 'Identifier' ? imported.name : imported.value;
  return name === DEFINE && isShellImport(specifier.parentPath);
}

function isAssigned(path: NodePath): boolean {
  const parent = path.parentPath;
  if (parent === null) return false;
  if (parent.isUpdateExpression()) return true;
  return parent.isAssignmentExpression() && path.key === 'left';
}

const isCallee = (path: NodePath, type: 'CallExpression' | 'NewExpression'): boolean =>
  path.parentPath?.node.type === type && path.key === 'callee';

interface Member {
  member: string;
  parent: NodePath;
}

// Член свободного имени: у Math.round — round; вычисляемый ключ — не член из списка.
function memberOf(path: NodePath): Member | null {
  const parent = path.parentPath;
  if (parent === null || !parent.isMemberExpression() || path.key !== 'object' || parent.node.computed) return null;
  const property = parent.node.property;
  return property.type === 'Identifier' ? { member: property.name, parent } : null;
}

function memberProblem(name: string, found: Member): string | null {
  if (MEMBER_GLOBALS[name]?.has(found.member) !== true) return SDK_TEXT.member(name, found.member);
  return isAssigned(found.parent) ? SDK_TEXT.assign(`${name}.${found.member}`) : null;
}

const intlProblem = (found: Member | null): string | null =>
  found !== null && NEW_INTL.has(found.member) && isCallee(found.parent, 'NewExpression') ? null : SDK_TEXT.newCall;

const isKnownGlobal = (name: string): boolean =>
  Object.hasOwn(MEMBER_GLOBALS, name) || NEW_GLOBALS.has(name) || CALL_GLOBALS.has(name);

// Свободное имя: подходит ли под список разрешённого. Текст отказа или null.
function freeNameProblem(path: NodePath<Identifier>): string | null {
  const { name } = path.node;
  if (isAssigned(path)) return SDK_TEXT.assign(name);
  const found = memberOf(path);
  if (name === 'Intl') return intlProblem(found);
  if (found !== null && Object.hasOwn(MEMBER_GLOBALS, name)) return memberProblem(name, found);
  if (NEW_GLOBALS.has(name) && isCallee(path, 'NewExpression')) return null;
  if (CALL_GLOBALS.has(name) && isCallee(path, 'CallExpression')) return null;
  if (VALUE_GLOBALS.has(name)) return null;
  return isKnownGlobal(name) ? SDK_TEXT.value(name) : SDK_TEXT.name(name);
}

const isDefinitionCallee = (path: NodePath, state: FileState): boolean =>
  state.entry && path.key === 'callee' && path.parentPath?.parentPath?.isExportDefaultDeclaration() === true;

// Имя-значение без объявления в файлах секции — по списку разрешённого; defineSection — только в export default.
function checkIdentifier(path: NodePath<Identifier>, state: FileState): void {
  const { name } = path.node;
  if (inTypePosition(path)) return;
  if (name.startsWith(SERVICE_PREFIX)) report(state, path.node, SDK_TEXT.service(name));
  if (!path.isReferencedIdentifier() && !isAssigned(path)) return;
  const binding = valueBinding(path);
  const text = binding === undefined ? freeNameProblem(path) : null;
  if (text !== null) report(state, path.node, text);
  if (isDefineBinding(binding) && !isDefinitionCallee(path, state)) report(state, path.node, SDK_TEXT.defineOnly);
}

const isStaticKey = (node: Node): boolean => node.type === 'StringLiteral' || node.type === 'NumericLiteral';

// a[k] с ключом-выражением: читать и писать «=» можно — при сохранении ключ уходит в помощник (script-rewrite.ts).
function computedProblem(path: NodePath): string | null {
  const parent = path.parentPath;
  if (parent === null) return null;
  if (parent.isUpdateExpression()) return SDK_TEXT.computedUpdate;
  if (parent.isAssignmentExpression() && path.key === 'left')
    return parent.node.operator === '=' ? null : SDK_TEXT.computedUpdate;
  const inPattern =
    parent.isArrayPattern() ||
    parent.isRestElement() ||
    (parent.isAssignmentPattern() && path.key === 'left') ||
    (parent.isObjectProperty() && path.key === 'value' && parent.parentPath.isObjectPattern());
  const loopLeft = (parent.isForOfStatement() || parent.isForInStatement()) && path.key === 'left';
  return inPattern || loopLeft ? SDK_TEXT.computedPattern : null;
}

function checkMember(path: NodePath, state: FileState): void {
  const node = path.node;
  if (node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression') return;
  const field = staticKey(node.property, node.computed);
  if (field !== null && FORBIDDEN_FIELDS.has(field)) return report(state, node.property, SDK_TEXT.field(field));
  if (!node.computed || isStaticKey(node.property)) return;
  if (node.type === 'OptionalMemberExpression') return report(state, node, SDK_TEXT.optionalComputed);
  const text = computedProblem(path);
  if (text !== null) report(state, node, text);
}

function checkKey(path: NodePath, state: FileState): void {
  const node = path.node;
  if (node.type !== 'ObjectProperty' && node.type !== 'ObjectMethod') return;
  const field = staticKey(node.key, node.computed);
  if (field !== null && FORBIDDEN_FIELDS.has(field)) return report(state, node.key, SDK_TEXT.field(field));
  const inPattern = path.parentPath?.isObjectPattern() === true;
  if (inPattern && node.computed && !isStaticKey(node.key)) report(state, node.key, SDK_TEXT.computedPattern);
}

// new своей функции и выражения; свободное имя после new проверяет checkIdentifier.
function checkNew(path: NodePath, state: FileState): void {
  const node = path.node;
  if (node.type !== 'NewExpression') return;
  const callee = node.callee;
  const free = callee.type === 'Identifier' && path.scope.getBinding(callee.name) === undefined;
  const intl =
    callee.type === 'MemberExpression' && callee.object.type === 'Identifier' && callee.object.name === 'Intl';
  if (!free && !intl) report(state, node, SDK_TEXT.newCall);
}

const reportAll =
  (state: FileState, text: string) =>
  (path: NodePath): void =>
    report(state, path.node, text);

const visitorOf = (state: FileState): Visitor => ({
  Identifier: (path) => checkIdentifier(path, state),
  'MemberExpression|OptionalMemberExpression': (path) => checkMember(path, state),
  'ObjectProperty|ObjectMethod': (path) => checkKey(path, state),
  NewExpression: (path) => checkNew(path, state),
  Import: (path) => report(state, path.parent, SDK_TEXT.dynamicImport),
  ImportExpression: reportAll(state, SDK_TEXT.dynamicImport),
  ThisExpression: reportAll(state, SDK_TEXT.this),
  Super: reportAll(state, SDK_TEXT.super),
  'ClassDeclaration|ClassExpression': reportAll(state, SDK_TEXT.class),
  MetaProperty: reportAll(state, SDK_TEXT.meta),
  [DECLARE_TYPES]: reportAll(state, SDK_TEXT.declare),
  UnaryExpression: (path) => {
    if (path.node.operator === 'delete') report(state, path.node, SDK_TEXT.delete);
  },
  VariableDeclaration: (path) => {
    if (path.node.declare === true) report(state, path.node, SDK_TEXT.declare);
  },
});

// Значение const верхнего уровня: литерал, массив и объект из литералов, функция, x as const.
function isStaticValue(node: Node | null | undefined): boolean {
  if (node === null || node === undefined) return false;
  const rule = STATIC_RULES[node.type];
  return rule !== undefined && rule(node);
}

const isStaticMember = (item: Node): boolean =>
  (item.type === 'ObjectMethod' && !item.computed) ||
  (item.type === 'ObjectProperty' && !item.computed && isStaticValue(item.value));

const always = (): boolean => true;

const STATIC_RULES: Readonly<Record<string, (node: Node) => boolean>> = {
  StringLiteral: always,
  NumericLiteral: always,
  BooleanLiteral: always,
  NullLiteral: always,
  BigIntLiteral: always,
  RegExpLiteral: always,
  ArrowFunctionExpression: always,
  FunctionExpression: always,
  TemplateLiteral: (node) => node.type === 'TemplateLiteral' && node.expressions.length === 0,
  UnaryExpression: (node) =>
    node.type === 'UnaryExpression' && ['-', '+'].includes(node.operator) && node.argument.type === 'NumericLiteral',
  ArrayExpression: (node) =>
    node.type === 'ArrayExpression' && node.elements.every((item) => item === null || isStaticValue(item)),
  ObjectExpression: (node) => node.type === 'ObjectExpression' && node.properties.every(isStaticMember),
  TSAsExpression: (node) => node.type === 'TSAsExpression' && isStaticValue(node.expression),
  TSSatisfiesExpression: (node) => node.type === 'TSSatisfiesExpression' && isStaticValue(node.expression),
};

function shellSpecifiers(node: Statement, state: FileState): void {
  if (node.type !== 'ImportDeclaration') return;
  for (const item of node.specifiers) {
    const name = item.type === 'ImportSpecifier' && item.imported.type === 'Identifier' ? item.imported.name : '';
    const fine = item.type === 'ImportSpecifier' && (item.importKind === 'type' || name === DEFINE);
    if (!fine) report(state, item, SDK_TEXT.importShell);
  }
}

// Из @merfy/shell — defineSection и типы; свой файл — по именам. Чужой пакет — import-forbidden при сборке esbuild.
function checkImport(node: Statement, state: FileState): void {
  if (node.type !== 'ImportDeclaration' || node.importKind === 'type') return;
  if (node.source.value === SHELL_MODULE) return shellSpecifiers(node, state);
  if (!RELATIVE.test(node.source.value)) return;
  for (const item of node.specifiers)
    if (item.type === 'ImportNamespaceSpecifier') report(state, item, SDK_TEXT.importStar);
}

const isStaticConst = (node: Statement): boolean =>
  node.type === 'VariableDeclaration' &&
  node.kind === 'const' &&
  node.declarations.every((item) => item.id.type === 'Identifier' && isStaticValue(item.init));

// export default в файле входа — defineSection({ … }); в своём файле — только function.
function checkDefaultExport(statement: NodePath<Statement>, state: FileState): void {
  if (!statement.isExportDefaultDeclaration()) return;
  const declaration = statement.get('declaration');
  if (!state.entry) {
    if (!declaration.isFunctionDeclaration()) report(state, statement.node, SDK_TEXT.topLevel);
    return;
  }
  if (!declaration.isCallExpression()) return report(state, statement.node, SDK_TEXT.defineForm, 'script-invalid');
  const callee = declaration.get('callee');
  const define = callee.isIdentifier() && isDefineBinding(callee.scope.getBinding(callee.node.name));
  if (!define) return report(state, statement.node, SDK_TEXT.defineForm, 'script-invalid');
  const args = declaration.get('arguments');
  const [first] = args;
  if (args.length !== 1 || first?.isStringLiteral() === true)
    return report(state, declaration.node, SDK_TEXT.defineName, 'script-invalid');
  if (first === undefined || !first.isObjectExpression())
    return report(state, declaration.node, SDK_TEXT.defineForm, 'script-invalid');
  state.definition = first;
}

// export { … } from '@merfy/shell' пронёс бы модуль ядра мимо uses — так же, как import.
function checkNamedExport(statement: NodePath<Statement>, state: FileState): void {
  if (!statement.isExportNamedDeclaration()) return;
  const { source, exportKind } = statement.node;
  if (source?.value === SHELL_MODULE && exportKind !== 'type')
    return report(state, statement.node, SDK_TEXT.importShell);
  const declaration = statement.get('declaration');
  if (declaration.isStatement()) checkTopLevel(declaration, state);
}

const isQuietStatement = (node: Statement): boolean =>
  node.type === 'FunctionDeclaration' ||
  node.type === 'EmptyStatement' ||
  TYPE_STATEMENTS.has(node.type) ||
  DECLARE_NODES.has(node.type) ||
  Reflect.get(node, 'declare') === true;

// Оператор верхнего уровня файла: объявления — да, исполняемый код — нет (design.md 3.1, «Решил сам» п. 2).
function checkTopLevel(statement: NodePath<Statement>, state: FileState): void {
  const node = statement.node;
  if (node.type === 'ExportNamedDeclaration') return checkNamedExport(statement, state);
  if (node.type === 'ExportDefaultDeclaration') return checkDefaultExport(statement, state);
  if (node.type === 'ImportDeclaration') return checkImport(node, state);
  if (node.type === 'ExportAllDeclaration') return report(state, node, SDK_TEXT.importStar);
  if (!isQuietStatement(node) && !isStaticConst(node)) report(state, node, SDK_TEXT.topLevel);
}

function checkFile(file: string, ast: File, entry: boolean): { state: FileState; facts: FileFacts } {
  const state: FileState = { file, entry, problems: [], definition: null };
  traverse(ast, {
    Program: (program) => {
      for (const statement of program.get('body')) checkTopLevel(statement, state);
    },
  });
  traverse(ast, visitorOf(state));
  return { state, facts: fileFacts(file, ast, state.definition) };
}

const byPlace = (left: SectionProblem, right: SectionProblem): number =>
  left.file.localeCompare(right.file) ||
  (left.line ?? 0) - (right.line ?? 0) ||
  (left.column ?? 0) - (right.column ?? 0);

// Все файлы .ts/.js секции; entry — вход скрипта (script.ts или script.js). Файл не разобрался — parsed: false.
export function checkScriptSource(files: SectionFiles, entry: string): ScriptCheck {
  const failures: SectionProblem[] = [];
  const checked: { state: FileState; facts: FileFacts }[] = [];
  for (const [file, text] of Object.entries(files)) {
    if (!SCRIPT_FILE.test(file)) continue;
    const parsed = parseFile(file, text);
    if ('failure' in parsed) failures.push(parsed.failure);
    else checked.push(checkFile(file, parsed.ast, file === entry));
  }
  const entryFacts = checked.find((item) => item.state.entry)?.facts ?? null;
  return {
    problems: [...failures, ...checked.flatMap((item) => item.state.problems)].sort(byPlace),
    parsed: failures.length === 0,
    facts: mergeFacts(
      entryFacts,
      checked.map((item) => item.facts),
    ),
  };
}
