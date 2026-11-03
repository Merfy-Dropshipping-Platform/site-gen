import { parse } from '@babel/parser';
import type { CallExpression, MemberExpression, Node, OptionalMemberExpression, Statement } from '@babel/types';
import { FORBIDDEN_FIELDS } from './script-sdk';
import { SHELL_MODULE, traverse } from './script-tree';

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

// Узлы дерева: все поля, в том числе массивы; обход стеком — глубина не ограничена. Пустые значения (undefined, null) в
// полях бывают: у свойства-сокращения { kind } значение — клон идентификатора с range: undefined, — и обход идёт дальше,
// а не кончается на них (03.11: из-за этого оставался голый defineSection(…) и страница падала целиком).
function nodesOf(root: Node): Node[] {
  const found: Node[] = [];
  const seen = new Set<Node>();
  const stack: unknown[] = [root];
  while (stack.length > 0) {
    const value = stack.pop();
    if (Array.isArray(value)) stack.push(...value.map((item: unknown) => item));
    else if (isNode(value) && !seen.has(value)) {
      // Один узел, достижимый двумя путями, правится один раз: две одинаковые вставки сломали бы текст.
      seen.add(value);
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

const shellImports = (body: readonly Statement[]): Statement[] =>
  body.filter((item) => item.type === 'ImportDeclaration' && item.source.value === SHELL_MODULE);

// Локальные имена всего, что модуль берёт из @merfy/shell: defineSection, его псевдонимы, defineStore.
function shellLocals(body: readonly Statement[]): Set<string> {
  return new Set(
    shellImports(body).flatMap((item) =>
      item.type === 'ImportDeclaration' ? item.specifiers.map((spec) => spec.local.name) : [],
    ),
  );
}

// import из @merfy/shell — убрать; defineSection(x) — (x).
function shellEdits(body: readonly Statement[], nodes: readonly Node[], locals: ReadonlySet<string>): Edit[] {
  const imports = shellImports(body);
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

// Что осталось от @merfy/shell или не разобралось в переписанном модуле: на витрине это ReferenceError на всю страницу.
// offset — место в переписанном тексте; name — источник import/реэкспорта, имя из @merfy/shell или текст ошибки разбора.
export interface Leftover {
  kind: 'import' | 'name' | 'syntax';
  name: string;
  offset: number;
}

const fromModule = (node: Node): string | null => {
  const withSource =
    node.type === 'ImportDeclaration' || node.type === 'ExportAllDeclaration' || node.type === 'ExportNamedDeclaration';
  return withSource && node.source != null ? node.source.value : null;
};

// Переписанный модуль не должен ничего брать снаружи: ни import и реэкспорта, ни свободного имени из @merfy/shell
// (locals — имена, которые модуль брал оттуда до переписывания). Переменная с таким же именем внутри функции — своя.
export function leftoversOf(text: string, locals: ReadonlySet<string>): Leftover[] {
  let ast: ReturnType<typeof parse>;
  try {
    ast = parse(text, { sourceType: 'module', attachComment: false });
  } catch (error) {
    const pos: unknown = error instanceof SyntaxError ? Reflect.get(error, 'pos') : undefined;
    const message = error instanceof Error ? error.message : String(error);
    return [{ kind: 'syntax', name: message, offset: typeof pos === 'number' ? pos : 0 }];
  }
  const imports = nodesOf(ast.program).flatMap((node): Leftover[] => {
    const source = fromModule(node);
    return source === null ? [] : [{ kind: 'import', name: source, offset: startOf(node) }];
  });
  const names: Leftover[] = [];
  traverse(ast, {
    Identifier: (path) => {
      const { name } = path.node;
      if (locals.has(name) && path.isReferencedIdentifier() && !path.scope.hasBinding(name))
        names.push({ kind: 'name', name, offset: startOf(path.node) });
    },
  });
  return [...imports, ...names].sort((left, right) => left.offset - right.offset);
}

export interface Rewritten {
  text: string;
  leftovers: Leftover[];
}

// Модуль секции после esbuild → модуль без импортов, с помощником ключей, если он нужен; плюс то, что от @merfy/shell
// в нём всё же осталось (script.ts превращает это в отказ при check, а не в падение страницы на витрине).
export function rewriteChecked(code: string): Rewritten {
  const ast = parse(code, { sourceType: 'module', attachComment: false });
  const nodes = nodesOf(ast.program);
  const locals = shellLocals(ast.program.body);
  const keys = keyEdits(code, nodes);
  const rewritten = applyEdits(code, [...shellEdits(ast.program.body, nodes, locals), ...keys]);
  const text = keys.length === 0 ? rewritten : `${KEY_HELPERS}\n${rewritten}`;
  return { text, leftovers: leftoversOf(text, locals) };
}

export const rewriteModule = (code: string): string => rewriteChecked(code).text;
