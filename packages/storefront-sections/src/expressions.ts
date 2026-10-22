import { fieldOf, isNode, type AstNode } from './ast';

// Выражения шаблона секции — «только SDK» (блок 2 «Секций и SDK», «Решил сам» п. 11; 1в Д). Выражение читает данные
// секции и строит из них разметку: settings, blocks, параметры своих стрелочных функций и несколько встроенных объектов
// без доступа к процессу. Нельзя: другие глобальные имена (process, fetch, globalThis…), new, function, class, this,
// import(), присваивание, await, функции с телом { … } (в теле — циклы), свойства constructor, prototype, __proto__ и
// repeat, ключ в [ ] не строкой и не числом. Граница песочницы — права процесса рендера (isolation.ts): запреты здесь
// обходятся, их цель — понятная ошибка автору при сохранении. Префикс __merfy сообщает template.ts.
export const SERVICE_PREFIX = '__merfy';
export const EXPRESSION_GLOBALS: ReadonlySet<string> = new Set([
  'settings',
  'blocks',
  'undefined',
  'NaN',
  'Infinity',
  'Math',
  'Number',
  'String',
  'Boolean',
  'JSON',
  'Array',
]);
const FORBIDDEN_PROPERTIES: ReadonlySet<string> = new Set([
  'constructor',
  'prototype',
  '__proto__',
  '__defineGetter__',
  '__defineSetter__',
  '__lookupGetter__',
  '__lookupSetter__',
  'repeat',
]);
const ALLOWED: ReadonlySet<string> = new Set([
  'Literal',
  'TemplateLiteral',
  'TemplateElement',
  'TaggedTemplateExpression',
  'ChainExpression',
  'CallExpression',
  'ConditionalExpression',
  'LogicalExpression',
  'BinaryExpression',
  'UnaryExpression',
  'ArrayExpression',
  'ObjectExpression',
  'SpreadElement',
  'ParenthesizedExpression',
  'SequenceExpression',
  'JSXEmptyExpression',
]);
// Обёртки TypeScript: внутри — выражение, тип не проверяем.
const TYPE_WRAPPERS: ReadonlySet<string> = new Set(['TSAsExpression', 'TSSatisfiesExpression', 'TSNonNullExpression']);
const LABELS: Partial<Record<string, string>> = {
  NewExpression: 'new',
  FunctionExpression: 'function',
  ClassExpression: 'class',
  ThisExpression: 'this',
  ImportExpression: 'import()',
  MetaProperty: 'import.meta',
  AssignmentExpression: 'присваивание',
  UpdateExpression: '++ и --',
  AwaitExpression: 'await',
  YieldExpression: 'yield',
};

const TEXT = {
  name: (name: string) =>
    `имя ${name}: в выражениях шаблона — только settings, blocks, параметры функций и Math, Number, String, Boolean, JSON, Array`,
  property: (name: string) => `свойство ${name}: в шаблоне секции нельзя`,
  computed: 'ключ в [ ]: в шаблоне секции — только строка или число',
  node: (label: string) => `${label}: в шаблоне секции нельзя — выражение только читает данные секции`,
  body: 'функция с телом { … }: в шаблоне секции — только (x) => выражение',
} as const;

export interface Found {
  at: number;
  message: string;
}

type Role = 'jsx' | 'expression' | 'pattern';
type Scope = ReadonlySet<string>;

interface Item {
  value: unknown;
  scope: Scope;
  role: Role;
}

interface Step {
  found: Found[];
  next: Item[];
}

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const nodesIn = (value: unknown): AstNode[] => (Array.isArray(value) ? value.filter(isNode) : [value].filter(isNode));
const childrenOf = (node: AstNode): unknown[] => Object.values(node).filter((value) => typeof value === 'object');
const item = (value: unknown, scope: Scope, role: Role = 'expression'): Item => ({ value, scope, role });
const found = (node: AstNode, message: string): Step => ({ found: [{ at: node.start, message }], next: [] });
const children = (node: AstNode, scope: Scope, role: Role): Step => ({
  found: [],
  next: childrenOf(node).map((value) => item(value, scope, role)),
});

// Имя свойства: obj.name, obj['name'], { name: … }; число и вычисленное — пустая строка.
const keyName = (key: unknown): string =>
  isNode(key) ? stringOf(fieldOf(key, key.type === 'Literal' ? 'value' : 'name')) : '';

function keyFound(key: unknown, computed: boolean): Found[] {
  if (!isNode(key)) return [];
  if (computed && key.type !== 'Literal') return [{ at: key.start, message: TEXT.computed }];
  const name = keyName(key);
  return FORBIDDEN_PROPERTIES.has(name) ? [{ at: key.start, message: TEXT.property(name) }] : [];
}

function memberStep(node: AstNode, scope: Scope): Step {
  const computed = fieldOf(node, 'computed') === true;
  return { found: keyFound(fieldOf(node, 'property'), computed), next: [item(fieldOf(node, 'object'), scope)] };
}

// Свойство объекта ({ a: … }) или шаблона параметра (({ a }) => …): ключ проверяется, значение — по своей роли.
function propertyStep(node: AstNode, scope: Scope, role: Role): Step {
  const computed = fieldOf(node, 'computed') === true;
  return { found: keyFound(fieldOf(node, 'key'), computed), next: [item(fieldOf(node, 'value'), scope, role)] };
}

// Имена, которые связывает шаблон параметра: x, { a, b: c }, [d], e = 1, ...f.
export function bindingNames(pattern: unknown): string[] {
  if (!isNode(pattern)) return [];
  if (pattern.type === 'Identifier') return [stringOf(fieldOf(pattern, 'name'))];
  if (pattern.type === 'Property') return bindingNames(fieldOf(pattern, 'value'));
  if (pattern.type === 'AssignmentPattern') return bindingNames(fieldOf(pattern, 'left'));
  if (pattern.type === 'RestElement') return bindingNames(fieldOf(pattern, 'argument'));
  return nodesIn(fieldOf(pattern, pattern.type === 'ArrayPattern' ? 'elements' : 'properties')).flatMap(bindingNames);
}

function arrowStep(node: AstNode, scope: Scope): Step {
  if (fieldOf(node, 'async') === true) return found(node, TEXT.node('async'));
  const body = fieldOf(node, 'body');
  if (isNode(body) && body.type === 'BlockStatement') return found(node, TEXT.body);
  const params = nodesIn(fieldOf(node, 'params'));
  const inner = new Set([...scope, ...params.flatMap(bindingNames)]);
  return { found: [], next: [...params.map((param) => item(param, inner, 'pattern')), item(body, inner)] };
}

function referenceStep(node: AstNode, scope: Scope): Step {
  const name = stringOf(fieldOf(node, 'name'));
  if (scope.has(name) || EXPRESSION_GLOBALS.has(name) || name.startsWith(SERVICE_PREFIX))
    return { found: [], next: [] };
  return found(node, TEXT.name(name));
}

// Шаблон параметра: имена уже в области видимости; проверяются ключи и значения по умолчанию.
function patternStep(node: AstNode, scope: Scope): Step {
  if (node.type === 'Identifier') return { found: [], next: [] };
  if (node.type === 'Property') return propertyStep(node, scope, 'pattern');
  if (node.type === 'AssignmentPattern')
    return { found: [], next: [item(fieldOf(node, 'left'), scope, 'pattern'), item(fieldOf(node, 'right'), scope)] };
  return children(node, scope, 'pattern');
}

const EXPRESSION_STEPS: Partial<Record<string, (node: AstNode, scope: Scope) => Step>> = {
  Identifier: referenceStep,
  MemberExpression: memberStep,
  Property: (node, scope) => propertyStep(node, scope, 'expression'),
  ArrowFunctionExpression: arrowStep,
  JSXElement: (node, scope) => ({ found: [], next: [item(node, scope, 'jsx')] }),
  JSXFragment: (node, scope) => ({ found: [], next: [item(node, scope, 'jsx')] }),
};

function expressionStep(node: AstNode, scope: Scope): Step {
  const special = EXPRESSION_STEPS[node.type];
  if (special !== undefined) return special(node, scope);
  if (TYPE_WRAPPERS.has(node.type)) return { found: [], next: [item(fieldOf(node, 'expression'), scope)] };
  if (node.type === 'UnaryExpression' && fieldOf(node, 'operator') === 'delete')
    return found(node, TEXT.node('delete'));
  if (!ALLOWED.has(node.type)) return found(node, TEXT.node(LABELS[node.type] ?? node.type));
  return children(node, scope, 'expression');
}

// Разметка: выражения — в {…} и {...} атрибутов; frontmatter проверяет template.ts.
function jsxStep(node: AstNode, scope: Scope): Step {
  if (node.type.includes('Frontmatter')) return { found: [], next: [] };
  if (node.type === 'JSXExpressionContainer') return { found: [], next: [item(fieldOf(node, 'expression'), scope)] };
  if (node.type === 'JSXSpreadAttribute') return { found: [], next: [item(fieldOf(node, 'argument'), scope)] };
  return children(node, scope, 'jsx');
}

const ROLE_STEPS: Readonly<Record<Role, (node: AstNode, scope: Scope) => Step>> = {
  jsx: jsxStep,
  expression: expressionStep,
  pattern: patternStep,
};

// Все запреты выражений шаблона. Обход — стеком: глубину шаблона уже ограничил depth.ts, но рекурсии здесь нет.
export function expressionProblems(root: unknown): Found[] {
  const problems: Found[] = [];
  const stack: Item[] = [item(root, new Set(), 'jsx')];
  for (let current = stack.pop(); current !== undefined; current = stack.pop()) {
    for (const node of nodesIn(current.value)) {
      const step = ROLE_STEPS[current.role](node, current.scope);
      problems.push(...step.found);
      stack.push(...step.next);
    }
  }
  return problems;
}
