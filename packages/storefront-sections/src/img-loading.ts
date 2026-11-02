import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import type { CodeFound } from './taste-code';

// Порядок загрузки картинок решает платформа (storefront-build, image-loading.ts; замер PageSpeed 02.11.2026: секция
// шапки с loading="eager" у восемнадцати скрытых картинок меню и поиска — LCP 19 с). Главной картинке страницы сборка
// ставит loading="eager" и fetchpriority="high", остальным — loading="lazy"; свои loading и fetchpriority шаблона
// снимаются. loading="eager" и fetchpriority в шаблоне — предупреждение: они не действуют, а автор думает, что
// действуют. loading="lazy" — не предупреждение: сборка ставит то же. Одно предупреждение на секцию.

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

// Значение строкой; выражение {…} — null: что в нём, видно только при рендере.
const literalValue = (attribute: AstNode): string | null => {
  const value = fieldOf(attribute, 'value');
  return isNode(value) && value.type === 'Literal' ? stringOf(fieldOf(value, 'value')).trim().toLowerCase() : null;
};

// Атрибут, который сборка снимет зря: fetchpriority — любой, loading — кроме строки lazy.
const ignored = (attribute: AstNode): boolean => {
  const name = attributeName(attribute);
  return name === 'fetchpriority' || (name === 'loading' && literalValue(attribute) !== 'lazy');
};

export function imgLoadingFound(ast: unknown): CodeFound[] {
  const found = nodesOf(ast)
    .filter((node) => node.type === 'JSXElement' && elementName(node) === 'img')
    .flatMap((element) => attributesOf(element).filter(ignored));
  const first = found[0];
  if (first === undefined) return [];
  const names = ['loading', 'fetchpriority']
    .filter((name) => found.some((item) => attributeName(item) === name))
    .join(' и ');
  const message = `${names} у <img> (${found.length}) не действуют: порядок загрузки ставит платформа — главной картинке страницы eager и fetchpriority="high", остальным lazy. Убери атрибут`;
  return [{ at: first.start, code: 'taste-img-loading', message }];
}
