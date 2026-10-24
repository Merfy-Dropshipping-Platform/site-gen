import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import { positionAt } from './position';

// Имена в разметке шаблона для сверки имён (design.md блока 5, разделы 3.4 и 3.9): каждое действие data-action="…" —
// строкой в шаблоне, с местом в template.astro. Значение из выражения (data-action={x}) не сверяется. Дерево — то же,
// что у проверки шаблона (template.ts): второй раз шаблон не разбирается.
export const ACTION_ATTRIBUTE = 'data-action';

export interface MarkupName {
  name: string;
  line: number;
  column: number;
}

export interface TemplateMarkup {
  actions: readonly MarkupName[];
}

export const NO_MARKUP: TemplateMarkup = { actions: [] };

// data-action="pick hover:preview" → «pick» и «hover:preview» с местом каждого.
function actionTokens(node: AstNode, text: string): MarkupName[] {
  if (node.type !== 'JSXAttribute') return [];
  const name = fieldOf(node, 'name');
  const value = fieldOf(node, 'value');
  if (!isNode(name) || fieldOf(name, 'name') !== ACTION_ATTRIBUTE) return [];
  if (!isNode(value) || value.type !== 'Literal' || typeof fieldOf(value, 'value') !== 'string') return [];
  const from = value.start + 1;
  const raw = text.slice(from, value.end - 1);
  return [...raw.matchAll(/\S+/g)].map((match) => ({ name: match[0], ...positionAt(text, from + match.index) }));
}

export const templateMarkup = (ast: unknown, text: string): TemplateMarkup => ({
  actions: nodesOf(ast).flatMap((node) => actionTokens(node, text)),
});
