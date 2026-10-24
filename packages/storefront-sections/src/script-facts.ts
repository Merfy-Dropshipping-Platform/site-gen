import type { NodePath, Visitor } from '@babel/traverse';
import type {
  ArrowFunctionExpression,
  File,
  FunctionExpression,
  Identifier,
  Node,
  ObjectExpression,
  Program,
} from '@babel/types';
import { isShellImport, placeOf, staticKey, traverse } from './script-tree';

// Факты скрипта секции (часть 5в блока 5): события ctx.listen, чтения ctx.<имя>[.<поле>], ключи actions и классы
// toggleClass — то, что проверка при сохранении сверяет с шаблоном и каталогами ядра. Обход — traverse из
// script-tree.ts, имя поля — staticKey, место — placeOf; код секции не выполняется.

export interface NameAt {
  name: string;
  file: string;
  line: number;
  column: number;
}
// Чтение поля ctx: ['settings', 'heading'], ['cart'], ['theme', 'cart-type']; место — последнего имени.
export interface CtxRead {
  path: readonly string[];
  file: string;
  line: number;
  column: number;
}
// actions — ключи actions определения; null — ключи не известны (actions не объект, spread, ключ из выражения) или
// определения нет.
export interface ScriptFacts {
  actions: readonly string[] | null;
  listens: readonly NameAt[];
  reads: readonly CtxRead[];
  classes: readonly string[];
}
export type FileFacts = ScriptFacts;
export const NO_FACTS: ScriptFacts = { actions: null, listens: [], reads: [], classes: [] };

const CTX_TYPE_NAMES = new Set(['Ctx', 'BaseCtx']);
const LISTEN = 'listen';
const TOGGLE_CLASS = 'toggleClass';

const paramAt = (params: readonly Node[], index: number): Identifier | null => {
  const param = params[index];
  return param !== undefined && param.type === 'Identifier' ? param : null;
};

const isHandlerNode = (node: Node | null | undefined): node is FunctionExpression | ArrowFunctionExpression =>
  node !== undefined &&
  node !== null &&
  (node.type === 'FunctionExpression' || node.type === 'ArrowFunctionExpression');

const keyOf = (node: Node): string | null =>
  node.type === 'ObjectMethod' || node.type === 'ObjectProperty' ? staticKey(node.key, node.computed) : null;

// Параметры свойства определения: метод — свои, свойство-функция — параметры значения.
function handlerParamsOf(property: Node): readonly Node[] | null {
  if (property.type === 'ObjectMethod') return property.params;
  return property.type === 'ObjectProperty' && isHandlerNode(property.value) ? property.value.params : null;
}

// Второй параметр mount, unmount и каждой функции в actions — ctx (design.md 3.2).
function addDefinitionCtx(definition: NodePath<ObjectExpression> | null, names: Set<string>): void {
  if (definition === null) return;
  for (const property of definition.node.properties) {
    const key = keyOf(property);
    if (key === 'mount' || key === 'unmount') addSecondParam(property, names);
    if (key === 'actions') addActionParams(property, names);
  }
}

function addSecondParam(property: Node, names: Set<string>): void {
  const params = handlerParamsOf(property);
  const param = params === null ? null : paramAt(params, 1);
  if (param !== null) names.add(param.name);
}

function addActionParams(property: Node, names: Set<string>): void {
  const value = property.type === 'ObjectProperty' ? property.value : null;
  if (value === null || value.type !== 'ObjectExpression') return;
  for (const action of value.properties) addSecondParam(action, names);
}

// Параметр с типом Ctx<…> или BaseCtx<…>, если тип импортирован из @merfy/shell (isShellImport).
function ctxTypedParam(params: readonly Node[], program: NodePath<Program>): Identifier | null {
  const param = paramAt(params, 0);
  if (param === null || param.typeAnnotation?.type !== 'TSTypeAnnotation') return null;
  const reference = param.typeAnnotation.typeAnnotation;
  if (reference.type !== 'TSTypeReference' || reference.typeName.type !== 'Identifier') return null;
  if (!CTX_TYPE_NAMES.has(reference.typeName.name)) return null;
  const binding = program.scope.getBinding(reference.typeName.name);
  return binding !== undefined && isShellImport(binding.path.parentPath) ? param : null;
}

// Параметры своей функции файла (function или const f = (…) => …), вызванной по имени.
function localParamsOf(call: NodePath, name: string): readonly Node[] | null {
  const binding = call.scope.getBinding(name);
  const node = binding?.path.node;
  if (node === undefined) return null;
  if (node.type === 'FunctionDeclaration') return node.params;
  const init = node.type === 'VariableDeclarator' ? node.init : undefined;
  return isHandlerNode(init) ? init.params : null;
}

// До неподвижной точки: параметр своей функции файла, на место которого в вызове передали ссылку на ctx
// (subscribe(ctx) — внутри subscribe параметр x тоже ctx).
function addPassedCtx(names: Set<string>, program: NodePath<Program>): void {
  let changed = true;
  while (changed) {
    changed = false;
    program.traverse({
      CallExpression: (call) => {
        const callee = call.node.callee;
        if (callee.type !== 'Identifier') return;
        const params = localParamsOf(call, callee.name);
        if (params === null) return;
        for (const [index, argument] of call.node.arguments.entries())
          if (addArgumentCtx(argument, params[index], names)) changed = true;
      },
    });
  }
}

function addArgumentCtx(argument: Node, param: Node | undefined, names: Set<string>): boolean {
  const isCtx = argument.type === 'Identifier' && names.has(argument.name);
  const target = param !== undefined && param.type === 'Identifier' ? param : null;
  if (!isCtx || target === null || names.has(target.name)) return false;
  names.add(target.name);
  return true;
}

function ctxNamesOf(program: NodePath<Program>, definition: NodePath<ObjectExpression> | null): ReadonlySet<string> {
  const names = new Set<string>();
  const addTyped = (params: readonly Node[]): void => {
    const param = ctxTypedParam(params, program);
    if (param !== null) names.add(param.name);
  };
  addDefinitionCtx(definition, names);
  program.traverse({
    FunctionDeclaration: (path) => addTyped(path.node.params),
    ArrowFunctionExpression: (path) => addTyped(path.node.params),
    FunctionExpression: (path) => addTyped(path.node.params),
    ObjectMethod: (path) => addTyped(path.node.params),
  });
  addPassedCtx(names, program);
  return names;
}

// actions — ключи объекта actions определения; нет actions — []; spread, ключ из выражения или actions не объект — null.
function actionsOf(definition: NodePath<ObjectExpression> | null): readonly string[] | null {
  if (definition === null) return null;
  for (const property of definition.node.properties) {
    if (keyOf(property) !== 'actions') continue;
    const value = property.type === 'ObjectProperty' ? property.value : null;
    if (value === null || value.type !== 'ObjectExpression') return null;
    return actionKeysOf(value);
  }
  return [];
}

function actionKeysOf(value: ObjectExpression): readonly string[] | null {
  const keys: string[] = [];
  for (const property of value.properties) {
    if (property.type === 'SpreadElement') return null;
    const key = keyOf(property);
    if (key === null) return null;
    keys.push(key);
  }
  return keys;
}

interface MemberChain {
  base: Identifier;
  names: readonly string[];
}

// Цепочка членов: ctx.theme['cart-type'] → база ctx и имена по порядку; вычисляемый ключ из выражения обрывает цепочку.
function chainOf(node: Node): MemberChain | null {
  const names: string[] = [];
  let current: Node = node;
  while (current.type === 'MemberExpression' || current.type === 'OptionalMemberExpression') {
    const key = staticKey(current.property, current.computed);
    if (key === null) return null;
    names.unshift(key);
    current = current.object;
  }
  return current.type === 'Identifier' ? { base: current, names } : null;
}

const argTextOf = (node: Node): string | null => {
  if (node.type === 'StringLiteral') return node.value;
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) return node.quasis[0]?.value.cooked ?? null;
  return null;
};

// Классы toggleClass('a b', …): строки первого аргумента (у ?: — обе ветки) по пробелам.
function collectClasses(node: Node, classes: Set<string>): void {
  if (node.type === 'StringLiteral') {
    addClassNames(node.value, classes);
    return;
  }
  if (node.type === 'ConditionalExpression') {
    collectClasses(node.consequent, classes);
    collectClasses(node.alternate, classes);
  }
}

function addClassNames(text: string, classes: Set<string>): void {
  for (const name of text.split(' ')) if (name !== '') classes.add(name);
}

interface CollectState {
  file: string;
  ctxNames: ReadonlySet<string>;
  // Имя из const { settings } = ctx: чтения через него — ['settings', …].
  aliases: Map<string, readonly string[]>;
  listens: NameAt[];
  reads: CtxRead[];
  classes: Set<string>;
}

const collectVisitor = (state: CollectState): Visitor => ({
  CallExpression: (call) => {
    const [first] = call.node.arguments;
    const callee = call.node.callee;
    const method = callee.type === 'MemberExpression' && !callee.computed ? callee.property : null;
    const name = method !== null && method.type === 'Identifier' ? method.name : '';
    const object = callee.type === 'MemberExpression' ? callee.object : null;
    const isCtx = object !== null && object.type === 'Identifier' && state.ctxNames.has(object.name);
    if (first !== undefined && isCtx && name === LISTEN) recordListen(first, state);
    if (first !== undefined && name === TOGGLE_CLASS) collectClasses(first, state.classes);
  },
  MemberExpression: (member) => recordRead(member.node, state),
  VariableDeclarator: (declarator) => recordAliases(declarator.node, state),
});

function recordListen(argument: Node, state: CollectState): void {
  const name = argTextOf(argument);
  const place = placeOf(argument);
  if (name !== null && place !== undefined) state.listens.push({ name, file: state.file, ...place });
}

function recordRead(node: Node, state: CollectState): void {
  const chain = chainOf(node);
  if (chain === null || chain.names.length === 0) return;
  const prefix = state.ctxNames.has(chain.base.name) ? [] : state.aliases.get(chain.base.name);
  if (prefix === undefined) return;
  const place = placeOf(node.type === 'MemberExpression' ? node.property : node);
  if (place !== undefined) state.reads.push({ path: [...prefix, ...chain.names], file: state.file, ...place });
}

// const { settings, theme: t } = ctx: новое имя — псевдоним ctx с путём [ключ]; само чтение — факт с местом ключа.
function recordAliases(node: Node, state: CollectState): void {
  if (node.type !== 'VariableDeclarator') return;
  const init = node.init;
  if (init === undefined || init === null || init.type !== 'Identifier' || !state.ctxNames.has(init.name)) return;
  if (node.id.type !== 'ObjectPattern') return;
  for (const property of node.id.properties) {
    if (property.type !== 'ObjectProperty') continue;
    const key = staticKey(property.key, property.computed);
    if (key === null || property.value.type !== 'Identifier') continue;
    state.aliases.set(property.value.name, [key]);
    const place = placeOf(property.key);
    if (place !== undefined) state.reads.push({ path: [key], file: state.file, ...place });
  }
}

// definition — объект из export default defineSection({ … }) файла входа; в своих файлах — null.
export function fileFacts(file: string, ast: File, definition: NodePath<ObjectExpression> | null): FileFacts {
  const state: CollectState = {
    file,
    ctxNames: new Set(),
    aliases: new Map(),
    listens: [],
    reads: [],
    classes: new Set(),
  };
  traverse(ast, {
    Program: (program) => {
      state.ctxNames = ctxNamesOf(program, definition);
      program.traverse(collectVisitor(state));
    },
  });
  return {
    actions: actionsOf(definition),
    listens: state.listens,
    reads: state.reads,
    classes: [...state.classes].sort(),
  };
}

// actions — из файла входа (нет его — null), остальное — из всех файлов; классы — без повторов, по алфавиту.
export function mergeFacts(entry: FileFacts | null, all: readonly FileFacts[]): ScriptFacts {
  return {
    actions: entry === null ? null : entry.actions,
    listens: all.flatMap((item) => item.listens),
    reads: all.flatMap((item) => item.reads),
    classes: [...new Set(all.flatMap((item) => [...item.classes]))].sort(),
  };
}
