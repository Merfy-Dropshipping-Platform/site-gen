import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import { positionAt } from './position';
import type { ProblemCode } from './problems';

// Проверки кода шаблона (страница code.md документации SDK): шаблон описывает вид, а не программу. Ловят то, что
// надёжно видно по дереву разбора: условный оператор ?: внутри другого, условие из многих частей, class:list с веткой
// на каждое значение одного поля и одно и то же условие в нескольких местах. Только предупреждения: секция
// сохраняется, автор исправляет по ответу. Выражение читается до разметки: разметка внутри выражения — свои {…}.
export const TERNARY_DEPTH_MAX = 1; // ?: внутри ?: — уже вложенность
export const CONDITION_PARTS_MAX = 3; // a && b && c — ещё читается, из четырёх частей — нет
export const VALUE_BRANCHES_MAX = 2; // одно поле с двумя значениями в class:list — включено или нет; с тремя — таблица
export const CONDITION_REPEATS_MAX = 2; // третье одинаковое условие в шаблоне — пора считать его один раз

const SHORT_TEXT = 60;
const PAGE_PATH = 'page.path'; // сравнение адреса ссылки с адресом страницы — это aria-current
const CLASS_ATTRIBUTES: ReadonlySet<string> = new Set(['class', 'class:list']);
const EQUALITY: ReadonlySet<string> = new Set(['===', '!==', '==', '!=']);
const COMPARISON: ReadonlySet<string> = new Set([...EQUALITY, '<', '>', '<=', '>=']);

export type CodeFound = { at: number; code: ProblemCode; message: string };

// Коды этих проверок — для отбора: тесты библиотеки пока их не считают (секции переписывает отдельная задача).
export const CODE_TASTE_CODES: ReadonlySet<ProblemCode> = new Set([
  'taste-nested-ternary',
  'taste-long-condition',
  'taste-class-branches',
  'taste-repeated-condition',
]);

const isJsx = (node: AstNode): boolean => node.type === 'JSXElement' || node.type === 'JSXFragment';
const isArrow = (node: AstNode): boolean => node.type === 'ArrowFunctionExpression';
const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');

const childNodes = (node: AstNode): AstNode[] =>
  Object.values(node).flatMap((value: unknown) =>
    Array.isArray(value) ? value.filter(isNode) : [value].filter(isNode),
  );

// Узлы выражения без разметки внутри него; stop — где ещё не спускаться (функции-предикаты).
function expressionNodes(root: AstNode, stop: (node: AstNode) => boolean = () => false): AstNode[] {
  const found: AstNode[] = [];
  const stack: AstNode[] = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (isJsx(node)) continue;
    found.push(node);
    if (node !== root && stop(node)) continue;
    stack.push(...childNodes(node));
  }
  return found;
}

// Выражения {…} шаблона: в разметке и в значениях атрибутов.
const containersOf = (ast: unknown): AstNode[] =>
  nodesOf(ast)
    .filter((node) => node.type === 'JSXExpressionContainer')
    .map((node) => fieldOf(node, 'expression'))
    .filter(isNode);

function attributeName(attribute: AstNode): string {
  const name = fieldOf(attribute, 'name');
  if (!isNode(name)) return '';
  if (name.type !== 'JSXNamespacedName') return stringOf(fieldOf(name, 'name'));
  const part = (key: string): string => {
    const value = fieldOf(name, key);
    return isNode(value) ? stringOf(fieldOf(value, 'name')) : '';
  };
  return `${part('namespace')}:${part('name')}`;
}

const classExpressions = (ast: unknown): AstNode[] =>
  nodesOf(ast)
    .filter((node) => node.type === 'JSXAttribute' && CLASS_ATTRIBUTES.has(attributeName(node)))
    .map((node) => fieldOf(node, 'value'))
    .filter(isNode)
    .map((value) => fieldOf(value, 'expression'))
    .filter(isNode);

const sourceOf = (text: string, node: AstNode): string => text.slice(node.start, node.end).replace(/\s+/g, '');
const shortOf = (value: string): string => (value.length > SHORT_TEXT ? `${value.slice(0, SHORT_TEXT - 1)}…` : value);

// Списки по ключу в порядке первого появления (Map.groupBy — только с ES2024).
function groupBy<T>(items: readonly T[], keyOf: (item: T) => string): [string, T[]][] {
  const groups = new Map<string, T[]>();
  for (const item of items) groups.set(keyOf(item), [...(groups.get(keyOf(item)) ?? []), item]);
  return [...groups];
}

// items.map(…) в {cond && items.map(…)} — вывод списка, а не часть условия.
const isListOutput = (node: AstNode): boolean => {
  const callee = fieldOf(node, 'callee');
  const property = isNode(callee) ? fieldOf(callee, 'property') : undefined;
  return node.type === 'CallExpression' && isNode(property) && fieldOf(property, 'name') === 'map';
};

// ---- ?: внутри ?:

// Глубина ?: под узлом — самый длинный путь вниз через ?:, не через разметку.
function ternaryDepth(root: AstNode): number {
  let deepest = 0;
  const stack: { node: AstNode; depth: number }[] = [{ node: root, depth: 0 }];
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    if (isJsx(item.node)) continue;
    const depth = item.depth + (item.node.type === 'ConditionalExpression' ? 1 : 0);
    deepest = Math.max(deepest, depth);
    stack.push(...childNodes(item.node).map((node) => ({ node, depth })));
  }
  return deepest;
}

// Внешние ?: выражения: те, над которыми в этом выражении нет другого ?:.
function outerTernaries(root: AstNode): AstNode[] {
  const found: AstNode[] = [];
  const stack: AstNode[] = [root];
  for (let node = stack.pop(); node !== undefined; node = stack.pop()) {
    if (isJsx(node)) continue;
    if (node.type === 'ConditionalExpression') found.push(node);
    else stack.push(...childNodes(node));
  }
  return found;
}

function ternaryFound(expression: AstNode): CodeFound[] {
  return outerTernaries(expression).flatMap((node) => {
    const depth = ternaryDepth(node);
    if (depth <= TERNARY_DEPTH_MAX) return [];
    const message = `условный оператор ?: внутри другого (уровней: ${depth}): ветки читаются с трудом. Класс по значению поля — вариантом data-[…]:, текст по числу или виду — данными или отдельными элементами`;
    return [{ at: node.start, code: 'taste-nested-ternary' as const, message }];
  });
}

// ---- условие из многих частей

const unwrapped = (node: AstNode): AstNode => {
  const inner = node.type === 'ParenthesizedExpression' ? fieldOf(node, 'expression') : undefined;
  return isNode(inner) ? unwrapped(inner) : node;
};

// Части условия a && (b || c): операнды && и || подряд, кроме разметки — она результат, а не условие.
function conditionParts(root: AstNode): AstNode[] {
  const parts: AstNode[] = [];
  const stack: AstNode[] = [root];
  for (let raw = stack.pop(); raw !== undefined; raw = stack.pop()) {
    const node = unwrapped(raw);
    if (node.type === 'LogicalExpression') {
      stack.push(...[fieldOf(node, 'right'), fieldOf(node, 'left')].filter(isNode));
      continue;
    }
    if (!isJsx(node) && !isListOutput(node)) parts.push(node);
  }
  return parts;
}

// Корни цепочек && и ||: логическое выражение, над которым (через скобки) нет другого логического.
function logicalRoots(root: AstNode): AstNode[] {
  const found: AstNode[] = [];
  const stack: { node: AstNode; inside: boolean }[] = [{ node: root, inside: false }];
  for (let item = stack.pop(); item !== undefined; item = stack.pop()) {
    const { node, inside } = item;
    if (isJsx(node)) continue;
    const logical = node.type === 'LogicalExpression';
    if (logical && !inside) found.push(node);
    const keep = logical || (inside && node.type === 'ParenthesizedExpression');
    stack.push(...childNodes(node).map((child) => ({ node: child, inside: keep })));
  }
  return found;
}

function conditionFound(expression: AstNode): CodeFound[] {
  return logicalRoots(expression).flatMap((node) => {
    const parts = conditionParts(node).length;
    if (parts <= CONDITION_PARTS_MAX) return [];
    const message = `условие из ${parts} частей в разметке: его не прочитать с одного взгляда. Разбей разметку на элементы со своим условием или посчитай значение один раз — атрибутом data-* у общего предка`;
    return [{ at: node.start, code: 'taste-long-condition' as const, message }];
  });
}

// ---- class:list: ветка на каждое значение поля

interface Branch {
  at: number;
  subject: string;
  value: string;
}

function branchOf(node: AstNode, text: string): Branch | undefined {
  if (node.type !== 'BinaryExpression' || !EQUALITY.has(stringOf(fieldOf(node, 'operator')))) return undefined;
  const sides = [fieldOf(node, 'left'), fieldOf(node, 'right')].filter(isNode).map(unwrapped);
  const literal = sides.find((side) => side.type === 'Literal');
  const subject = sides.find((side) => side.type !== 'Literal');
  if (literal === undefined || subject === undefined) return undefined;
  return { at: node.start, subject: sourceOf(text, subject), value: String(fieldOf(literal, 'value')) };
}

// settings.size, settings['<поле>'], block.settings.x → имя для data-атрибута; иначе «…».
const dataNameOf = (subject: string): string =>
  /\.([\w-]+)$|\['([\w-]+)'\]$/.exec(subject)?.slice(1).find(Boolean) ?? '…';

function branchFound(expression: AstNode, text: string): CodeFound[] {
  const branches = expressionNodes(expression, isArrow)
    .map((node) => branchOf(node, text))
    .filter((branch): branch is Branch => branch !== undefined)
    .sort((left, right) => left.at - right.at);
  return groupBy(branches, (branch) => branch.subject).flatMap(([subject, list]) => {
    const values = [...new Set(list.map((branch) => branch.value))];
    const first = list[0];
    if (values.length <= VALUE_BRANCHES_MAX || first === undefined) return [];
    const name = dataNameOf(subject);
    const value = values[0] ?? '';
    const message = `классы: ${shortOf(subject)} сравнивается с ${values.length} значениями (${values.join(', ')}) — ветка на каждое значение. Передай значение атрибутом data-${name}={${shortOf(subject)}} и задай классы вариантами: data-[${name}=${value}]:… на этом элементе, in-data-[${name}=${value}]:… у вложенных`;
    return [{ at: first.at, code: 'taste-class-branches' as const, message }];
  });
}

// ---- одно условие в нескольких местах

// Условие для сравнения мест: без пробелов, «не равно» — как «равно», отрицание ! снято.
function conditionKey(node: AstNode, text: string): string | undefined {
  if (node.type === 'CallExpression') return isListOutput(node) ? undefined : sourceOf(text, node);
  if (node.type !== 'BinaryExpression') return undefined;
  const operator = stringOf(fieldOf(node, 'operator'));
  if (!COMPARISON.has(operator)) return undefined;
  const sides = [fieldOf(node, 'left'), fieldOf(node, 'right')].filter(isNode).map((side) => sourceOf(text, side));
  return sides.join(operator.replace('!', '='));
}

const withoutNot = (node: AstNode): AstNode => {
  const plain = unwrapped(node);
  const argument = fieldOf(plain, 'argument');
  return plain.type === 'UnaryExpression' && fieldOf(plain, 'operator') === '!' && isNode(argument)
    ? withoutNot(argument)
    : plain;
};

// Условия выражения: проверка ?:, части && и ||, значения объекта class:list, сравнение целиком (hidden={a === 0}).
// Внутрь стрелочных функций не спускаемся: предикат some(…) — одно условие целиком.
function conditionsOf(expression: AstNode): AstNode[] {
  const nodes = expressionNodes(expression, isArrow);
  const places = [
    ...[expression].filter((node) => unwrapped(node).type === 'BinaryExpression'),
    ...nodes.flatMap((node) => {
      if (node.type === 'ConditionalExpression') return [fieldOf(node, 'test')].filter(isNode);
      if (node.type === 'LogicalExpression') return conditionParts(node);
      if (node.type === 'Property') return [fieldOf(node, 'value')].filter(isNode);
      return [];
    }),
  ];
  return [...new Set(places.map(withoutNot))];
}

function repeatFound(expressions: readonly AstNode[], text: string): CodeFound[] {
  const places = expressions
    .flatMap(conditionsOf)
    .flatMap((node) => {
      const key = conditionKey(node, text);
      return key === undefined ? [] : [{ key, at: node.start }];
    })
    .filter((place, index, all) => all.findIndex((other) => other.at === place.at) === index)
    .sort((left, right) => left.at - right.at);
  return groupBy(places, (place) => place.key).flatMap(([key, list]) => {
    const first = list[0];
    if (list.length <= CONDITION_REPEATS_MAX || first === undefined) return [];
    const lines = [...new Set(list.map((place) => positionAt(text, place.at).line))].join(', ');
    const fix = key.includes(PAGE_PATH)
      ? 'Текущую ссылку отметь один раз — aria-current, а вид задай вариантом aria-[current=page]:'
      : 'Посчитай его один раз — атрибутом data-* у общего предка, а классы задай вариантами in-data-[…]:';
    const message = `условие ${shortOf(key)} стоит в ${list.length} местах (строки ${lines}): правка в одном месте забудется в другом. ${fix}`;
    return [{ at: first.at, code: 'taste-repeated-condition' as const, message }];
  });
}

// Предупреждения кода шаблона по дереву разбора @astrojs/compiler-rs; text — сам шаблон, места — индексы в нём.
export function codeFound(ast: unknown, text: string): CodeFound[] {
  const expressions = containersOf(ast);
  return [
    ...expressions.flatMap(ternaryFound),
    ...expressions.flatMap(conditionFound),
    ...classExpressions(ast).flatMap((expression) => branchFound(expression, text)),
    ...repeatFound(expressions, text),
  ];
}
