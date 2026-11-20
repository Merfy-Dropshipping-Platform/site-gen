import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import type { CodeFound } from './taste-code';

// Порядок загрузки картинок ставит платформа (storefront-build, image-loading.ts). Шаблон главнее сборки (19.11.2026):
// явные loading="eager" и loading="lazy" у <img> сборка оставляет — так секция делает eager первые карточки сетки.
// fetchpriority="high" сборка ставит одной главной картинке страницы, свой fetchpriority шаблона снимается: он не
// действует, а автор думает, что действует — предупреждение. loading={…} — не предупреждение. Явный eager сборка
// оставляет только в первом экране (до конца секции с главной картинкой), ниже снимает (20.11.2026): loading="eager"
// строкой — подсказка про это. Не больше одного предупреждения каждого рода на секцию.

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

// Свой eager строкой: loading="eager". Выражение — loading={…} — подсказки не получает: что в нём, проверка не знает.
const isEagerLiteral = (attribute: AstNode): boolean => {
  const value = fieldOf(attribute, 'value');
  const isString = isNode(value) && value.type === 'Literal' && fieldOf(value, 'value') === 'eager';
  return attributeName(attribute) === 'loading' && isString;
};

const imgAttributes = (ast: unknown): AstNode[] =>
  nodesOf(ast)
    .filter((node) => node.type === 'JSXElement' && elementName(node) === 'img')
    .flatMap(attributesOf);

function priorityFound(attributes: readonly AstNode[]): CodeFound[] {
  const found = attributes.filter(ignored);
  const first = found[0];
  if (first === undefined) return [];
  const message = `fetchpriority у <img> (${found.length}) не действует: «high» сборка ставит одной главной картинке страницы сама. Убери атрибут; нужна сразу — поставь loading="eager"`;
  return [{ at: first.start, code: 'taste-img-loading', message }];
}

// Подсказка, не ошибка: eager автора сборка оставляет только в первом экране страницы.
function eagerFound(attributes: readonly AstNode[]): CodeFound[] {
  const found = attributes.filter(isEagerLiteral);
  const first = found[0];
  if (first === undefined) return [];
  const message = `loading="eager" у <img> (${found.length}): сборка оставит его только в первом экране страницы — до конца секции с главной картинкой включительно; ниже она заменит eager на lazy. Для картинки первого экрана так и надо, для остальных убери атрибут`;
  return [{ at: first.start, code: 'taste-img-loading', message }];
}

export function imgLoadingFound(ast: unknown): CodeFound[] {
  const attributes = imgAttributes(ast);
  return [...priorityFound(attributes), ...eagerFound(attributes)];
}
