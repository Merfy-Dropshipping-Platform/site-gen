import { fieldOf, isNode, nodesOf, type AstNode } from './ast';
import type { CodeFound } from './taste-code';

// Содержимое в разметке шаблона (Н-«Оценка владельца» после «Лавренти», 30.10): надписи и адреса картинок прямо в
// template.astro мерчант поменять не может — только через код. Содержимое секции — параметры section.json
// (string, text, image), шаблон лишь выводит {settings.<имя>}. Только предупреждения: секция сохраняется. Два
// предупреждения на секцию, а не по одному на надпись: ответ проверки читает ИИ, лишние строки — лишние токены.
const SAMPLES_MAX = 3;
const SAMPLE_LENGTH = 40;
const LETTERS_MIN = 3; // «×», «→», «1» и сущности (&nbsp;) надписью не считаются
const ENTITY = /&(?:#\d+|#x[\da-f]+|[a-z][a-z\d]*);/gi;
const LETTERS = /\p{L}/gu;

// Атрибуты, в которых адрес картинки строкой — это содержимое, а не вёрстка.
const IMAGE_ATTRIBUTES: ReadonlySet<string> = new Set(['src', 'srcset', 'poster', 'data-src']);
const ABSOLUTE_URL = /(?:^|[\s,])(?:https?:)?\/\/[^\s,]+/i;
const IMAGE_FILE = /\.(?:png|jpe?g|webp|gif|avif|svg)(?:[?#]\S*)?$/i;
const STOCK_HOST =
  /^https?:\/\/(?:[\w-]+\.)*(?:unsplash\.com|picsum\.photos|placehold\.co|placeholder\.com|pexels\.com)\//i;

const stringOf = (value: unknown): string => (typeof value === 'string' ? value : '');
const shortOf = (text: string): string => (text.length > SAMPLE_LENGTH ? `${text.slice(0, SAMPLE_LENGTH - 1)}…` : text);

// Надпись: текст между тегами без сущностей и пробельных повторов, не короче трёх букв.
function labelOf(raw: string): string | undefined {
  const text = raw.replace(ENTITY, ' ').replace(/\s+/g, ' ').trim();
  return (text.match(LETTERS)?.length ?? 0) >= LETTERS_MIN ? text : undefined;
}

function textFound(ast: unknown, text: string): CodeFound[] {
  const labels = nodesOf(ast)
    .filter((node) => node.type === 'JSXText')
    .flatMap((node) => {
      const label = labelOf(text.slice(node.start, node.end));
      return label === undefined ? [] : [{ at: node.start, label }];
    });
  const first = labels[0];
  if (first === undefined) return [];
  const samples = labels
    .slice(0, SAMPLES_MAX)
    .map((item) => `«${shortOf(item.label)}»`)
    .join(', ');
  const more = labels.length > SAMPLES_MAX ? ` и ещё ${labels.length - SAMPLES_MAX}` : '';
  const message = `текст прямо в разметке (${labels.length}): ${samples}${more}. Мерчант не сможет его поменять: вынеси в параметры section.json (string или text) и выведи {settings.<имя>}`;
  return [{ at: first.at, code: 'taste-literal-text', message }];
}

const attributeName = (attribute: AstNode): string => {
  const name = fieldOf(attribute, 'name');
  return isNode(name) ? stringOf(fieldOf(name, 'name')) : '';
};

const isImageUrl = (value: string): boolean => ABSOLUTE_URL.test(value) || IMAGE_FILE.test(value);

// Адрес картинки: в src, srcset, poster строкой или в строке кода (frontmatter) — ссылка на файл-картинку или фотобанк.
function imageFound(ast: unknown): CodeFound[] {
  const nodes = nodesOf(ast);
  const inAttributes = nodes
    .filter((node) => node.type === 'JSXAttribute' && IMAGE_ATTRIBUTES.has(attributeName(node)))
    .flatMap((node) => {
      const value = fieldOf(node, 'value');
      const url = isNode(value) && value.type === 'Literal' ? stringOf(fieldOf(value, 'value')) : '';
      return url !== '' && isImageUrl(url) ? [{ at: node.start, end: node.end, url }] : [];
    });
  const inCode = nodes
    .filter((node) => node.type === 'Literal')
    .flatMap((node) => {
      const url = stringOf(fieldOf(node, 'value'));
      const isPhoto = /^https?:\/\//i.test(url) && (IMAGE_FILE.test(url) || STOCK_HOST.test(url));
      const inside = inAttributes.some((item) => item.at <= node.start && node.end <= item.end);
      return isPhoto && !inside ? [{ at: node.start, url }] : [];
    });
  const all = [...inAttributes, ...inCode].sort((left, right) => left.at - right.at);
  const first = all[0];
  if (first === undefined) return [];
  const samples = all
    .slice(0, 2)
    .map((item) => `«${shortOf(item.url)}»`)
    .join(', ');
  const message = `адрес картинки прямо в шаблоне (${all.length}): ${samples}. Мерчант не сможет её заменить: сделай поле вида image в section.json и выведи {settings.<имя>}`;
  return [{ at: first.at, code: 'taste-literal-image', message }];
}

// Предупреждения о содержимом в разметке: надписи и адреса картинок. Место — первое из найденных.
export function literalFound(ast: unknown, text: string): CodeFound[] {
  return [...textFound(ast, text), ...imageFound(ast)];
}
