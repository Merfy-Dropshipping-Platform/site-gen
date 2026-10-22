import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import { SERVICE_PREFIX, expressionProblems, type Found } from './expressions';
import { TEMPLATE_FILE } from './format';
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
// Операторы frontmatter — без пробелов и «;». В части 1 в Astro.props только settings (Р3); blocks — часть 3.
const FRONTMATTER: ReadonlySet<string> = new Set(['const{settings}=Astro.props', 'const{settings,blocks}=Astro.props']);

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

function frontmatterFound(node: AstNode, text: string): Found[] {
  // У AstroFrontmatter операторы — в program.body.
  const program = fieldOf(node, 'program');
  const body = isNode(program) ? fieldOf(program, 'body') : fieldOf(node, 'body');
  const statements = Array.isArray(body) ? body.filter(isNode) : [];
  return statements.flatMap((statement) =>
    FRONTMATTER.has(text.slice(statement.start, statement.end).replace(/[\s;]/g, ''))
      ? []
      : [{ at: statement.start, message: TEXT.frontmatter }],
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

const rulesOf = (node: AstNode, text: string): Found[] =>
  node.type.includes('Frontmatter') ? frontmatterFound(node, text) : (NODE_RULES[node.type]?.(node, text) ?? []);

export async function templateProblems(text: string, richtext: RichtextIds = NO_RICHTEXT): Promise<SectionProblem[]> {
  const { parse } = await import('@astrojs/compiler-rs');
  const { ast } = await Promise.resolve(parse(text));
  return [
    ...nodesOf(ast).flatMap((node) => rulesOf(node, text)),
    ...expressionProblems(ast),
    ...setHtmlFound(ast, richtext),
  ]
    .sort((left, right) => left.at - right.at)
    .map((found) => problem('template-forbidden', TEMPLATE_FILE, found.message, positionAt(text, found.at)));
}
