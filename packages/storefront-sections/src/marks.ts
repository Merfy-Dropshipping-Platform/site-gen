import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import { TEMPLATE_FILE } from './format';
import { positionAt } from './position';
import { problem, type SectionProblem } from './problems';

// Метки блоков для превью (блок 1 «Секций и SDK», часть 3, Р57): платформа находит корневой элемент каждого
// blocks.map и вставляет в его открывающий тег data-merfy-block={Astro.props.__merfy.block(<имя>)} — автор метку не
// пишет. Модуль рендера компилируется из текста с метками (compile.ts), запреты и места ошибок — по исходному тексту.

export interface MarkedTemplate {
  text: string; // шаблон с метками; из него компилируется модуль рендера
  marks: number; // сколько меток вставлено
  unmarked: number[]; // начало каждого blocks.map без одного корневого элемента HTML (индекс знака в тексте)
}

const MARK = (name: string) => ` data-merfy-block={Astro.props.__merfy.block(${name})}`;
const NO_ROOT_TEXT = 'blocks.map без одного корневого элемента: подпункт выбирается только слева';
const NO_MAP_TEXT = 'в шаблоне нет blocks.map: подпункты выбираются только слева';

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const identifierOf = (value: unknown): string =>
  isNode(value) && value.type === 'Identifier' ? stringOf(fieldOf(value, 'name')) : '';
const isMember = (value: unknown): value is AstNode => isNode(value) && value.type === 'MemberExpression';

// blocks.map(...): вызов, callee — MemberExpression с object Identifier blocks и property map (не вычисляемое).
function blocksMapCall(node: AstNode): boolean {
  const callee = fieldOf(node, 'callee');
  if (!isMember(callee) || fieldOf(callee, 'computed') === true) return false;
  return identifierOf(fieldOf(callee, 'object')) === 'blocks' && identifierOf(fieldOf(callee, 'property')) === 'map';
}

// Корневой элемент стрелки: JSXElement с тегом HTML (со строчной буквы) — сам или в скобках.
function rootElementOf(arrow: AstNode): AstNode | null {
  const body = fieldOf(arrow, 'body');
  const element = isNode(body) && body.type === 'ParenthesizedExpression' ? fieldOf(body, 'expression') : body;
  if (!isNode(element) || element.type !== 'JSXElement') return null;
  const opening = fieldOf(element, 'openingElement');
  const name = isNode(opening) ? fieldOf(opening, 'name') : undefined;
  return isNode(name) && name.type === 'JSXIdentifier' && /^[a-z]/.test(stringOf(fieldOf(name, 'name'))) ? name : null;
}

// Первый элемент списка узлов: nodesOf обходит стеком и меняет порядок массивов, поэтому первый — по месту в тексте.
const firstOf = (value: unknown): unknown => {
  const nodes = (Array.isArray(value) ? value : [value]).filter(isNode);
  return [...nodes].sort((left, right) => left.start - right.start)[0];
};

// Место вставки метки и имя параметра одного blocks.map; нет корневого элемента — начало вызова в unmarked.
function markOf(call: AstNode): { insert: number; name: string } | null {
  const arrow = firstOf(fieldOf(call, 'arguments'));
  if (!isNode(arrow) || arrow.type !== 'ArrowFunctionExpression') return null;
  const name = identifierOf(firstOf(fieldOf(arrow, 'params')));
  const element = rootElementOf(arrow);
  if (name === '' || element === null) return null;
  return { insert: element.end, name };
}

export async function markBlocks(text: string): Promise<MarkedTemplate> {
  const { parse } = await import('@astrojs/compiler-rs');
  const { ast } = await Promise.resolve(parse(text));
  const calls = nodesOf(ast).filter((node) => node.type === 'CallExpression' && blocksMapCall(node));
  const marks = calls
    .map((call) => ({ call, mark: markOf(call) }))
    .filter((entry): entry is { call: AstNode; mark: { insert: number; name: string } } => entry.mark !== null)
    .sort((left, right) => right.mark.insert - left.mark.insert);
  const unmarked = calls
    .filter((call) => markOf(call) === null)
    .map((call) => call.start)
    .sort((left, right) => left - right);
  let marked = text;
  for (const { mark } of marks) marked = marked.slice(0, mark.insert) + MARK(mark.name) + marked.slice(mark.insert);
  return { text: marked, marks: marks.length, unmarked };
}

// Предупреждения block-select-unavailable (Р57) — только у секции с blocks в section.json: на каждое место из
// unmarked — своё; меток и unmarked нет — одно «в шаблоне нет blocks.map» без места.
export function blockSelectProblems(text: string, marked: MarkedTemplate, declared: boolean): SectionProblem[] {
  if (!declared) return [];
  const noRoot = marked.unmarked.map((at) =>
    problem('block-select-unavailable', TEMPLATE_FILE, NO_ROOT_TEXT, positionAt(text, at)),
  );
  if (noRoot.length > 0 || marked.marks > 0) return noRoot;
  return [problem('block-select-unavailable', TEMPLATE_FILE, NO_MAP_TEXT)];
}
