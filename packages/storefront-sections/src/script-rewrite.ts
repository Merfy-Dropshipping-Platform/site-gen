import { parse } from '@babel/parser';
import type { CallExpression, MemberExpression, Node, OptionalMemberExpression, Statement } from '@babel/types';
import { FORBIDDEN_FIELDS } from './script-sdk';
import { SHELL_MODULE } from './script-tree';

// Переписывание модуля секции при сохранении (design.md блока 5, раздел 3.9, «После проверки», пп. 1–2) — по тексту,
// который собрал esbuild (один файл, без типов, без сжатия). import из @merfy/shell и вызов defineSection(…) снимаются:
// остаётся export default { … }, импортов у модуля нет. Чтение a[k] с ключом-выражением — __merfyGet(a, k): только
// собственные поля объекта, номера массивов и строк; запись a[k] = v — __merfySet(a, k, v): служебное поле JS —
// исключение. Ключ приводится к строке один раз: объект с toString, который отвечает по-разному, не подменит поле между
// проверкой и чтением. Ключ-строку из FORBIDDEN_FIELDS (её мог подставить esbuild вместо переменной) — тоже в помощник.
export const KEY_HELPERS = [
  'const __merfyKey = (k) => (typeof k === "symbol" ? k : String(k));',
  `const __merfyBad = new Set(${JSON.stringify([...FORBIDDEN_FIELDS])});`,
  'const __merfyGet = (o, k) => { const key = __merfyKey(k); return Object.hasOwn(o, key) ? o[key] : undefined; };',
  'const __merfySet = (o, k, v) => { const key = __merfyKey(k); if (__merfyBad.has(key)) throw new TypeError(`поле ${String(key)} коду секции недоступно`); o[key] = v; return v; };',
].join('\n');

// Правка текста: [start, end) → text. Вставки в одном месте: сначала закрывающие (меньший узел раньше), потом замены,
// потом открывающие (больший узел раньше) — так a[i][j] даёт __merfyGet(__merfyGet(a, i), j).
interface Edit {
  start: number;
  end: number;
  text: string;
  rank: number;
}

const SPAN_LIMIT = 1e9;
const startOf = (node: Node): number => node.start ?? 0;
const endOf = (node: Node): number => node.end ?? 0;
const spanOf = (node: Node): number => endOf(node) - startOf(node);
const open = (at: number, text: string, span: number): Edit => ({
  start: at,
  end: at,
  text,
  rank: 3 * SPAN_LIMIT - span,
});
const close = (at: number, text: string, span: number): Edit => ({ start: at, end: at, text, rank: span });
const replace = (start: number, end: number, text: string): Edit => ({ start, end, text, rank: SPAN_LIMIT });

type Member = MemberExpression | OptionalMemberExpression;

const isMember = (node: Node): node is Member =>
  node.type === 'MemberExpression' || node.type === 'OptionalMemberExpression';

// Ключ, который идёт в помощник: выражение или строка служебного поля. Число и обычная строка — как есть.
function isGuardedKey(node: Member): boolean {
  if (!node.computed) return false;
  const key = node.property;
  if (key.type === 'NumericLiteral') return false;
  return key.type !== 'StringLiteral' || FORBIDDEN_FIELDS.has(key.value);
}

// Скобки ключа ищутся по тексту esbuild: между объектом и «[» — только «)», пробелы и «?.», «]» — последний знак члена.
// Скобки вокруг объекта и ключа остаются на месте: правка заменяет только сами «[», «]» и «=».
function readEdits(code: string, node: Member): Edit[] {
  return [
    open(startOf(node), '__merfyGet(', spanOf(node)),
    replace(code.indexOf('[', endOf(node.object)), code.indexOf('[', endOf(node.object)) + 1, ', '),
    replace(endOf(node) - 1, endOf(node), ')'),
  ];
}

function writeEdits(code: string, assignment: Node, target: Member): Edit[] {
  const bracket = code.indexOf('[', endOf(target.object));
  const equals = code.indexOf('=', endOf(target));
  return [
    open(startOf(assignment), '__merfySet(', spanOf(assignment)),
    replace(bracket, bracket + 1, ', '),
    replace(endOf(target) - 1, endOf(target), ', '),
    replace(equals, equals + 1, ''),
    close(endOf(assignment), ')', spanOf(assignment)),
  ];
}

const isNode = (value: unknown): value is Node =>
  typeof value === 'object' && value !== null && typeof Reflect.get(value, 'type') === 'string';

// Узлы дерева: все поля, в том числе массивы; обход стеком — глубина не ограничена.
function nodesOf(root: Node): Node[] {
  const found: Node[] = [];
  const stack: unknown[] = [root];
  for (let value = stack.pop(); value !== undefined; value = stack.pop()) {
    if (Array.isArray(value)) stack.push(...value.map((item: unknown) => item));
    else if (isNode(value)) {
      found.push(value);
      stack.push(...Object.entries(value).flatMap(([key, child]: [string, unknown]) => (key === 'loc' ? [] : [child])));
    }
  }
  return found;
}

// Запись a[k] = v: левая часть — не чтение.
function guardedWrite(node: Node): Member | null {
  if (node.type !== 'AssignmentExpression' || node.operator !== '=' || !isMember(node.left)) return null;
  return isGuardedKey(node.left) ? node.left : null;
}

function keyEdits(code: string, nodes: readonly Node[]): Edit[] {
  const writes = new Set<Node>();
  const edits = nodes.flatMap((node) => {
    const target = guardedWrite(node);
    if (target === null) return [];
    writes.add(target);
    return writeEdits(code, node, target);
  });
  const reads = nodes.filter((node): node is Member => isMember(node) && !writes.has(node) && isGuardedKey(node));
  return [...edits, ...reads.flatMap((node) => readEdits(code, node))];
}

const isShellCall =
  (locals: ReadonlySet<string>) =>
  (node: Node): node is CallExpression =>
    node.type === 'CallExpression' && node.callee.type === 'Identifier' && locals.has(node.callee.name);

// import из @merfy/shell — убрать; defineSection(x) — (x).
function shellEdits(body: readonly Statement[], nodes: readonly Node[]): Edit[] {
  const imports = body.filter((item) => item.type === 'ImportDeclaration' && item.source.value === SHELL_MODULE);
  const locals = new Set(
    imports.flatMap((item) =>
      item.type === 'ImportDeclaration' ? item.specifiers.map((spec) => spec.local.name) : [],
    ),
  );
  const calls = nodes.filter(isShellCall(locals)).flatMap((call) => {
    const [first] = call.arguments;
    if (first === undefined) return [];
    return [replace(startOf(call), startOf(first), '('), replace(endOf(first), endOf(call), ')')];
  });
  return [...imports.map((item) => replace(startOf(item), endOf(item), '')), ...calls];
}

function applyEdits(text: string, edits: readonly Edit[]): string {
  const sorted = [...edits].sort((left, right) => left.start - right.start || left.rank - right.rank);
  let out = '';
  let at = 0;
  for (const edit of sorted) {
    out += text.slice(at, edit.start) + edit.text;
    at = Math.max(at, edit.end);
  }
  return out + text.slice(at);
}

// Модуль секции после esbuild → модуль без импортов, с помощником ключей, если он нужен.
export function rewriteModule(code: string): string {
  const ast = parse(code, { sourceType: 'module', attachComment: false });
  const nodes = nodesOf(ast.program);
  const keys = keyEdits(code, nodes);
  const text = applyEdits(code, [...shellEdits(ast.program.body, nodes), ...keys]);
  return keys.length === 0 ? text : `${KEY_HELPERS}\n${text}`;
}
