import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import { SERVICE_PREFIX, USE_NAMES, expressionProblems, usesText, type Found } from './expressions';
import { TEMPLATE_FILE, type SectionUse } from './format';
import { positionAt } from './position';
import { problem, type SectionProblem } from './problems';
import { NO_RICHTEXT, setHtmlFound, type RichtextIds } from './set-html';

// Шаблон секции SDK 1 — template.astro (блок 1 «Секций и SDK», Р3, Р4; design.md блока 7, п. 17). Проверка — по дереву
// разбора @astrojs/compiler-rs, а не по тексту: тег, атрибут и выражение видны там, где их видит Astro. Скрипт — только
// файлом скрипта, своего CSS нет (классы Tailwind из словаря), документ — у сборки. Что можно в выражениях —
// expressions.ts (блок 2). Ошибки разбора здесь не сообщаются — их сообщает компиляция (compile.ts) с местом в шаблоне.
export const FORBIDDEN_TAGS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'link',
  'meta',
  'base',
  'html',
  'head',
  'body',
  'title',
  'iframe',
  'frame',
  'object',
  'embed',
  'merfy-section',
]);
// Тег HTML, SVG или своего элемента — со строчной буквы и без точки; остальное — компонент.
const HTML_TAG = /^[a-z][A-Za-z0-9-]*$/;
const DIRECTIVE = /^(?:set|is|define|client|server|transition):/;
const HANDLER = /^on/i;
const SCRIPT_URL = /^\s*javascript:/i;
// Оператор frontmatter — без пробелов и «;»: const { <имена> } = Astro.props. Имена — settings и blocks (части 1, 3),
// theme и shop — только с "uses" в section.json (часть 4, Р1-4-5); каждое один раз, порядок любой.
const FRONTMATTER = /^const\{([A-Za-z_$][\w$]*(?:,[A-Za-z_$][\w$]*)*)\}=Astro\.props$/;
const BASE_PROPS: ReadonlySet<string> = new Set(['settings', 'blocks']);

const TEXT = {
  tag: (name: string) => `тег <${name}> в шаблоне секции запрещён: скрипт — script.ts, документ — у сборки`,
  component: (name: string) => `компонент <${name}>: в шаблоне секции компонентов нет, кроме <Fragment>`,
  handler: (name: string) => `обработчик ${name}: события — только в script.ts`,
  directive: (name: string) => `директива ${name} в шаблоне секции запрещена`,
  spread: '{...} в атрибутах запрещён: перечисли атрибуты по одному',
  scriptUrl: 'адрес javascript: в шаблоне секции запрещён: действия — в script.ts',
  service: (name: string) => `имя ${name}: префикс __merfy — служебный`,
  frontmatter: 'во frontmatter только const { settings } = Astro.props;',
} as const;

type NodeRule = (node: AstNode, text: string) => Found[];

const at = (node: AstNode, messages: readonly string[]): Found[] =>
  messages.map((message) => ({ at: node.start, message }));

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');

// Имя тега или атрибута: div, set:html, Foo.Bar.
function nameText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (!isNode(value)) return '';
  if (value.type === 'JSXMemberExpression')
    return `${nameText(fieldOf(value, 'object'))}.${nameText(fieldOf(value, 'property'))}`;
  if (value.type === 'JSXNamespacedName')
    return `${nameText(fieldOf(value, 'namespace'))}:${nameText(fieldOf(value, 'name'))}`;
  return nameText(fieldOf(value, 'name'));
}

function tagTexts(name: string): string[] {
  if (FORBIDDEN_TAGS.has(name.toLowerCase())) return [TEXT.tag(name)];
  return name === 'Fragment' || HTML_TAG.test(name) ? [] : [TEXT.component(name)];
}

function attributeTexts(name: string): string[] {
  // set:html проверяет set-html.ts: можно только с настройкой вида richtext (часть 3, Р58).
  if (name === 'set:html') return [];
  if (DIRECTIVE.test(name)) return [TEXT.directive(name)];
  return HANDLER.test(name) ? [TEXT.handler(name)] : [];
}

const serviceTexts = (name: string): string[] => (name.startsWith(SERVICE_PREFIX) ? [TEXT.service(name)] : []);
const scriptUrlTexts = (value: string): string[] => (SCRIPT_URL.test(value) ? [TEXT.scriptUrl] : []);

// Один оператор frontmatter: не по форме, имя дважды или имя не из Astro.props секции — прежний отказ; theme или shop без
// "uses" — отказ с подсказкой про uses.
function statementFound(compact: string, at: number, uses: ReadonlySet<string>): Found[] {
  const names = FRONTMATTER.exec(compact)?.[1]?.split(',');
  if (names === undefined || new Set(names).size !== names.length) return [{ at, message: TEXT.frontmatter }];
  if (names.some((name) => !BASE_PROPS.has(name) && !USE_NAMES.has(name))) return [{ at, message: TEXT.frontmatter }];
  return names.filter((name) => USE_NAMES.has(name) && !uses.has(name)).map((name) => ({ at, message: usesText(name) }));
}

function frontmatterFound(node: AstNode, text: string, uses: ReadonlySet<string>): Found[] {
  // У AstroFrontmatter операторы — в program.body.
  const program = fieldOf(node, 'program');
  const body = isNode(program) ? fieldOf(program, 'body') : fieldOf(node, 'body');
  const statements = Array.isArray(body) ? body.filter(isNode) : [];
  return statements.flatMap((statement) =>
    statementFound(text.slice(statement.start, statement.end).replace(/[\s;]/g, ''), statement.start, uses),
  );
}

const NODE_RULES: Partial<Record<string, NodeRule>> = {
  JSXOpeningElement: (node) => at(node, tagTexts(nameText(node))),
  JSXAttribute: (node) => at(node, attributeTexts(nameText(node))),
  JSXSpreadAttribute: (node) => at(node, [TEXT.spread]),
  JSXIdentifier: (node) => at(node, serviceTexts(nameText(node))),
  Identifier: (node) => at(node, serviceTexts(stringOf(fieldOf(node, 'name')))),
  Literal: (node) => at(node, scriptUrlTexts(stringOf(fieldOf(node, 'value')))),
};

const rulesOf = (node: AstNode, text: string, uses: ReadonlySet<string>): Found[] =>
  node.type.includes('Frontmatter') ? frontmatterFound(node, text, uses) : (NODE_RULES[node.type]?.(node, text) ?? []);

export async function templateProblems(
  text: string,
  richtext: RichtextIds = NO_RICHTEXT,
  uses: readonly SectionUse[] = [],
): Promise<SectionProblem[]> {
  const declared = new Set(uses);
  const { parse } = await import('@astrojs/compiler-rs');
  const { ast } = await Promise.resolve(parse(text));
  return [
    ...nodesOf(ast).flatMap((node) => rulesOf(node, text, declared)),
    ...expressionProblems(ast, declared),
    ...setHtmlFound(ast, richtext),
  ]
    .sort((left, right) => left.at - right.at)
    .map((found) => problem('template-forbidden', TEMPLATE_FILE, found.message, positionAt(text, found.at)));
}
