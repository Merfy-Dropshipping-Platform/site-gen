import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import type { CodeFound } from './taste-code';

// Порядок загрузки картинок ставит платформа (storefront-build, image-loading.ts). Шаблон главнее сборки (19.11.2026):
// явные loading="eager" и loading="lazy" у <img> сборка оставляет — так секция делает eager первые карточки сетки.
// fetchpriority="high" сборка ставит одной главной картинке страницы, свой fetchpriority шаблона снимается: он не
// действует, а автор думает, что действует — предупреждение. loading={…} и loading="eager" — не предупреждение.
// Одно предупреждение на секцию.

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');

const elementName = (element: AstNode): string => {
  const opening = fieldOf(element, 'openingElement');
  const name = isNode(opening) ? fieldOf(opening, 'name') : undefined;
  return isNode(name) && name.type === 'JSXIdentifier' ? stringOf(fieldOf(name, 'name')).toLowerCase() : '';
};

const attributesOf = (element: AstNode): AstNode[] => {
  const opening = fieldOf(element, 'openingElement');
  const raw: unknown = isNode(opening) ? fieldOf(opening, 'attributes') : [];
  return (Array.isArray(raw) ? raw : []).filter(isNode).filter((node) => node.type === 'JSXAttribute');
};

const attributeName = (attribute: AstNode): string => {
  const name = fieldOf(attribute, 'name');
  return isNode(name) ? stringOf(fieldOf(name, 'name')).toLowerCase() : '';
};

// Атрибут, который сборка снимет зря: fetchpriority — любой.
const ignored = (attribute: AstNode): boolean => attributeName(attribute) === 'fetchpriority';

export function imgLoadingFound(ast: unknown): CodeFound[] {
  const found = nodesOf(ast)
    .filter((node) => node.type === 'JSXElement' && elementName(node) === 'img')
    .flatMap((element) => attributesOf(element).filter(ignored));
  const first = found[0];
  if (first === undefined) return [];
  const message = `fetchpriority у <img> (${found.length}) не действует: «high» сборка ставит одной главной картинке страницы сама. Убери атрибут; нужна сразу — поставь loading="eager"`;
  return [{ at: first.start, code: 'taste-img-loading', message }];
}
