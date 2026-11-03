import type { NodePath } from '@babel/traverse';
import type { Node } from '@babel/types';
import { checkAttributeWrite, checkCssVar } from '@merfy/shell/attributes';
import { attrHint, cssVarHint } from './attr-hints';
import { staticKey } from './script-tree';

// Запись атрибутов и переменных CSS из кода секции при сохранении (design.md блока 5, раздел 3.3). Ядро витрины
// отказывает в El.attr и El.cssVar при выполнении (storefront-shell, core/attributes.ts); здесь те же функции
// (checkAttributeWrite, checkCssVar — общий источник, не копия правил) применяются к вызовам, у которых имя и значение
// написаны в коде: литералом, шаблонной строкой без вставок, const со строкой, склейкой и условием из таких частей. Имя из
// вычисления (attr(name, …) с name из данных) при сохранении не известно — его проверит ядро в браузере. Какой это
// элемент, при сохранении тоже не известно, поэтому тег не сверяется: src у не-img ядро откажет само.
// Формы вызова: x.attr(…), x?.attr(…), x['attr'](…), x?.attr?.(…), (0, x.attr)(…), x.attr.call(x, …),
// x.attr.apply(x, […]), псевдоним const put = x.attr / x.attr.bind(x), деструктуризация const { attr } = x.
// Откуда взят x, не важно: у кода секции других объектов с методами attr и cssVar нет, El получают из ctx.ref, ctx.refs,
// closest и list.
type Method = 'attr' | 'cssVar';
type Mode = 'direct' | 'call' | 'apply';
interface Target {
  readonly method: Method;
  readonly mode: Mode;
}
// Известное значение аргумента: строка, число или null.
type Known = string | number | null;
const MAX_DEPTH = 4;
const MAX_CANDIDATES = 8;
const METHODS: ReadonlySet<string> = new Set(['attr', 'cssVar']);
const IMG = 'img';

export interface AttrFinding {
  readonly node: Node;
  readonly message: string;
}

function child(path: NodePath, key: string): NodePath | null {
  const found = path.get(key);
  return Array.isArray(found) ? null : found;
}

function children(path: NodePath, key: string): readonly NodePath[] {
  const found = path.get(key);
  return Array.isArray(found) ? found : [];
}

const isMember = (path: NodePath): boolean => path.isMemberExpression() || path.isOptionalMemberExpression();
const isCall = (path: NodePath): boolean => path.isCallExpression() || path.isOptionalCallExpression();
const isWrapper = (path: NodePath): boolean =>
  path.isTSNonNullExpression() ||
  path.isTSAsExpression() ||
  path.isTSSatisfiesExpression() ||
  path.isTSTypeAssertion() ||
  path.isParenthesizedExpression();

// x!, x as T, (x), (0, x) — значение то же.
function unwrap(path: NodePath): NodePath {
  if (isWrapper(path)) {
    const inner = child(path, 'expression');
    return inner === null ? path : unwrap(inner);
  }
  if (path.isSequenceExpression()) {
    const last = children(path, 'expressions').at(-1);
    return last === undefined ? path : unwrap(last);
  }
  return path;
}

function concat(left: readonly Known[], right: readonly Known[]): readonly Known[] | null {
  const joined: Known[] = [];
  for (const a of left) for (const b of right) joined.push(`${String(a)}${String(b)}`);
  return joined.length > MAX_CANDIDATES ? null : joined;
}

function union(left: readonly Known[] | null, right: readonly Known[] | null): readonly Known[] | null {
  if (left === null || right === null) return null;
  const all = [...left, ...right];
  return all.length > MAX_CANDIDATES ? null : all;
}

// const name = '…': значение берётся из объявления, если имя нигде не переписывают.
function constantValues(path: NodePath, depth: number): readonly Known[] | null {
  if (!path.isIdentifier()) return null;
  const binding = path.scope.getBinding(path.node.name);
  if (binding === undefined || !binding.constant || !binding.path.isVariableDeclarator()) return null;
  if (binding.path.node.id.type !== 'Identifier') return null;
  const init = child(binding.path, 'init');
  return init === null ? null : valuesOf(init, depth + 1);
}

// Все значения, которые может принять выражение, если они видны в коде; иначе null (значение известно только при выполнении).
function valuesOf(path: NodePath, depth = 0): readonly Known[] | null {
  if (depth > MAX_DEPTH) return null;
  const node = unwrap(path);
  if (node.isStringLiteral() || node.isNumericLiteral()) return [node.node.value];
  if (node.isNullLiteral()) return [null];
  if (node.isTemplateLiteral()) {
    const text = node.node.quasis[0]?.value.cooked;
    return node.node.expressions.length === 0 && typeof text === 'string' ? [text] : null;
  }
  if (node.isBinaryExpression({ operator: '+' })) {
    const left = valuesOf(node.get('left'), depth + 1);
    const right = valuesOf(node.get('right'), depth + 1);
    return left === null || right === null ? null : concat(left, right);
  }
  if (node.isConditionalExpression())
    return union(valuesOf(node.get('consequent'), depth + 1), valuesOf(node.get('alternate'), depth + 1));
  if (node.isLogicalExpression())
    return union(valuesOf(node.get('left'), depth + 1), valuesOf(node.get('right'), depth + 1));
  return constantValues(node, depth);
}

// Имя члена: x.attr, x?.attr, x['attr'], x[NAME] с const-строкой.
function memberKey(path: NodePath): string | null {
  const node = path.node;
  if (node.type !== 'MemberExpression' && node.type !== 'OptionalMemberExpression') return null;
  const direct = staticKey(node.property, node.computed);
  if (direct !== null) return direct;
  const property = child(path, 'property');
  const values = !node.computed || property === null ? null : valuesOf(property);
  const [only] = values ?? [];
  return values?.length === 1 && typeof only === 'string' ? only : null;
}

const argsOf = (call: NodePath): readonly NodePath[] => children(call, 'arguments');

// Имя, которое деструктуризация вводит: { attr }, { attr: put }, { attr = f }.
function boundName(value: Node): string | null {
  if (value.type === 'Identifier') return value.name;
  return value.type === 'AssignmentPattern' && value.left.type === 'Identifier' ? value.left.name : null;
}

// Псевдоним: const put = x.attr; const put = x.attr.bind(x); const { attr } = x; const { attr: put } = x.
function aliasTarget(path: NodePath, depth: number): Target | null {
  if (!path.isIdentifier()) return null;
  const binding = path.scope.getBinding(path.node.name);
  if (binding === undefined || !binding.constant || !binding.path.isVariableDeclarator()) return null;
  const declarator = binding.path;
  const id = declarator.node.id;
  if (id.type === 'ObjectPattern') {
    const property = id.properties.find(
      (item) => item.type === 'ObjectProperty' && boundName(item.value) === binding.identifier.name,
    );
    const key = property?.type === 'ObjectProperty' ? staticKey(property.key, property.computed) : null;
    return key !== null && METHODS.has(key) ? { method: key === 'attr' ? 'attr' : 'cssVar', mode: 'direct' } : null;
  }
  const init = child(declarator, 'init');
  if (id.type !== 'Identifier' || init === null) return null;
  const value = unwrap(init);
  if (isCall(value)) {
    const callee = child(value, 'callee');
    const bound = callee !== null && isMember(callee) && memberKey(callee) === 'bind' && argsOf(value).length <= 1;
    const object = bound && callee !== null ? child(callee, 'object') : null;
    const inner = object === null ? null : targetOf(object, depth + 1);
    return inner?.mode === 'direct' ? inner : null;
  }
  return targetOf(value, depth + 1, false);
}

// Что вызывают: метод attr или cssVar, напрямую или через call и apply.
function targetOf(callee: NodePath, depth = 0, alias = true): Target | null {
  if (depth > MAX_DEPTH) return null;
  const path = unwrap(callee);
  if (path.isIdentifier()) return alias ? aliasTarget(path, depth) : null;
  if (!isMember(path)) return null;
  const key = memberKey(path);
  if (key === 'attr' || key === 'cssVar') return { method: key, mode: 'direct' };
  if (key !== 'call' && key !== 'apply') return null;
  const object = child(path, 'object');
  const inner = object === null ? null : targetOf(object, depth + 1, false);
  return inner?.mode === 'direct' ? { method: inner.method, mode: key } : null;
}

// Аргументы записи: у call — после первого (this), у apply — элементы массива во втором.
function writeArgs(call: NodePath, mode: Mode): readonly NodePath[] | null {
  const args = argsOf(call);
  if (mode === 'direct') return args;
  if (mode === 'call') return args.slice(1);
  const list = args[1] === undefined ? null : unwrap(args[1]);
  return list !== null && list.isArrayExpression() ? children(list, 'elements') : null;
}

const hasSpread = (args: readonly NodePath[]): boolean =>
  args.some((arg) => arg.node === null || arg.isSpreadElement() || arg.isArgumentPlaceholder());

// Отказ ядра витрины: текст ShellError после «<имя>: » или null. Тег при сохранении не известен: берётся img, у него
// разрешены и href, и src. Значение не из литерала — null (снять), оно не сверяется.
function refusedBy(run: () => unknown, prefix: string): string | null {
  try {
    run();
    return null;
  } catch (error) {
    if (!(error instanceof Error) || Reflect.get(error, 'code') !== 'attr-forbidden') throw error;
    return error.message.startsWith(prefix) ? error.message.slice(prefix.length) : error.message;
  }
}

interface Refusal {
  readonly name: string;
  readonly why: string;
  readonly hint: string;
}

function attrRefusal(name: string, value: Known | undefined): Refusal | null {
  const lower = name.toLowerCase();
  const text = value === undefined || value === null ? null : String(value);
  const why = refusedBy(() => checkAttributeWrite(IMG, name, text), `${lower}: `);
  return why === null ? null : { name, why, hint: attrHint(lower) };
}

function cssVarRefusal(name: string, value: Known | undefined): Refusal | null {
  const why = refusedBy(() => checkCssVar(name, value ?? null), `--${name}: `);
  // Имя неверно, если отказ остаётся и без значения.
  const badName = refusedBy(() => checkCssVar(name, null), '') !== null;
  return why === null ? null : { name, why, hint: cssVarHint(badName) };
}

const refusalOf = (method: Method, name: string, value: Known | undefined): Refusal | null =>
  method === 'cssVar' ? cssVarRefusal(name, value) : attrRefusal(name, value);

// Первый отказ по именам и значениям вызова: все пары, пока значение известно.
function firstRefusal(method: Method, names: readonly Known[], values: readonly Known[] | null): Refusal | null {
  const pairs = names.flatMap((name) =>
    typeof name === 'string' ? (values ?? [undefined]).map((value) => ({ name, value })) : [],
  );
  for (const { name, value } of pairs) {
    const found = refusalOf(method, name, value);
    if (found !== null) return found;
  }
  return null;
}

// Запрещённая запись в вызове call или null. Чтение attr(name) и вызов с именем из вычисления — не запись, не проверяются.
export function attrFindingOf(call: NodePath): AttrFinding | null {
  const callee = child(call, 'callee');
  const target = callee === null ? null : targetOf(callee);
  const args = target === null ? null : writeArgs(call, target.mode);
  if (target === null || args === null || hasSpread(args) || args.length < 2) return null;
  const [nameArg, valueArg] = args;
  if (nameArg === undefined || valueArg === undefined) return null;
  const names = valuesOf(nameArg);
  const refused = names === null ? null : firstRefusal(target.method, names, valuesOf(valueArg));
  if (refused === null) return null;
  return { node: nameArg.node, message: `${target.method}('${refused.name}'): ${refused.why} · ${refused.hint}` };
}
