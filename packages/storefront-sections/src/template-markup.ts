import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import { EXT_POINT_ATTRIBUTE } from '@merfy/shell/ext-points';
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
  // Места блоков расширений (блок 12 «Секций и SDK», В12-2 А): data-ext-point="<место>" строкой. Нет мест — ключа нет.
  points?: readonly MarkupName[];
}

export const NO_MARKUP: TemplateMarkup = { actions: [] };

// Значение атрибута attribute строкой: слова с местом каждого. Значение из выражения — ничего.
function attributeTokens(node: AstNode, text: string, attribute: string): MarkupName[] {
  if (node.type !== 'JSXAttribute') return [];
  const name = fieldOf(node, 'name');
  const value = fieldOf(node, 'value');
  if (!isNode(name) || fieldOf(name, 'name') !== attribute) return [];
  if (!isNode(value) || value.type !== 'Literal' || typeof fieldOf(value, 'value') !== 'string') return [];
  const from = value.start + 1;
  const raw = text.slice(from, value.end - 1);
  return [...raw.matchAll(/\S+/g)].map((match) => ({ name: match[0], ...positionAt(text, from + match.index) }));
}

// data-action="pick hover:preview" → «pick» и «hover:preview»; data-ext-point="cart" → «cart» (блок 12).
export function templateMarkup(ast: unknown, text: string): TemplateMarkup {
  const nodes = nodesOf(ast);
  const actions = nodes.flatMap((node) => attributeTokens(node, text, ACTION_ATTRIBUTE));
  const points = nodes.flatMap((node) => attributeTokens(node, text, EXT_POINT_ATTRIBUTE));
  return points.length === 0 ? { actions } : { actions, points };
}
