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

// Элемент с data-ref="<имя>" строкой: template — есть ли у него дочерний <template> (для El.list); место — значение атрибута.
export interface MarkupRef extends MarkupName {
  template: boolean;
}

export interface TemplateMarkup {
  actions: readonly MarkupName[];
  // Места блоков расширений (блок 12 «Секций и SDK», В12-2 А): data-ext-point="<место>" строкой. Нет мест — ключа нет.
  points?: readonly MarkupName[];
  // Элементы с data-ref строкой, в том числе внутри <template>. Нет таких — ключа нет.
  refs?: readonly MarkupRef[];
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

export const REF_ATTRIBUTE = 'data-ref';

const tagOf = (node: AstNode): string => {
  const opening = fieldOf(node, 'openingElement');
  const name = isNode(opening) ? fieldOf(opening, 'name') : undefined;
  return isNode(name) && typeof fieldOf(name, 'name') === 'string' ? String(fieldOf(name, 'name')) : '';
};

const childrenOf = (node: AstNode): AstNode[] => {
  const found = fieldOf(node, 'children');
  return Array.isArray(found) ? found.filter(isNode) : [];
};

// Дочерний <template>: среди детей элемента; <template> внутри выражения ({cond && <template>…</template>}) тоже годится —
// какой из детей будет, при сохранении не известно.
function hasTemplateChild(element: AstNode): boolean {
  return childrenOf(element).some((item) => {
    if (item.type === 'JSXElement') return tagOf(item) === 'template';
    return (
      item.type === 'JSXExpressionContainer' &&
      nodesOf(item).some((node) => node.type === 'JSXElement' && tagOf(node) === 'template')
    );
  });
}

// Элемент со строковым data-ref: имя, дочерний <template>, место значения.
function refOf(node: AstNode, text: string): MarkupRef[] {
  if (node.type !== 'JSXElement') return [];
  const opening = fieldOf(node, 'openingElement');
  const attributes = isNode(opening) ? fieldOf(opening, 'attributes') : undefined;
  if (!Array.isArray(attributes)) return [];
  return attributes.filter(isNode).flatMap((attribute) =>
    attributeTokens(attribute, text, REF_ATTRIBUTE)
      .slice(0, 1)
      .map((token) => ({ ...token, template: hasTemplateChild(node) })),
  );
}

// data-action="pick hover:preview" → «pick» и «hover:preview»; data-ext-point="cart" → «cart» (блок 12);
// data-ref="lines" → «lines» и есть ли у элемента дочерний <template>.
export function templateMarkup(ast: unknown, text: string): TemplateMarkup {
  const nodes = nodesOf(ast);
  const actions = nodes.flatMap((node) => attributeTokens(node, text, ACTION_ATTRIBUTE));
  const points = nodes.flatMap((node) => attributeTokens(node, text, EXT_POINT_ATTRIBUTE));
  const refs = nodes.flatMap((node) => refOf(node, text));
  return {
    actions,
    ...(points.length === 0 ? {} : { points }),
    ...(refs.length === 0 ? {} : { refs }),
  };
}
