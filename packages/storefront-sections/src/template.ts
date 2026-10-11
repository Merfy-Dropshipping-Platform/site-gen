import { TEMPLATE_FILE } from './format';
import { positionAt } from './position';
import { problem, type SectionProblem } from './problems';

// Шаблон секции (design.md блока 7, п. 20; язык шаблона — С7-12, отложена): разметка как есть. Скрипт — только файлом
// скрипта (собирается с SDK внешним, п. 12), стили — только styles.css (в рамке секции, п. 17), документ — у сборки.
// Проверка — по тексту открывающих тегов, не разбор HTML: код секции и так работает в странице (п. 13), запрет держит
// форму. Место — строка и колонка тега.
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
const OPEN_TAG = /<([a-zA-Z][a-zA-Z0-9-]*)([^>]*)>/g;
const HANDLER = /\son[a-z]+\s*=/i;
const SCRIPT_URL = /=\s*["']?\s*javascript:/i;

interface OpenTag {
  name: string;
  attributes: string;
  index: number;
}

interface TagRule {
  broken: (tag: OpenTag) => boolean;
  message: (tag: OpenTag) => string;
}

const TAG_RULES: readonly TagRule[] = [
  {
    broken: (tag) => FORBIDDEN_TAGS.has(tag.name),
    message: (tag) => `тег <${tag.name}> в шаблоне нельзя: скрипт — script.ts, стили — styles.css, документ — у сборки`,
  },
  {
    broken: (tag) => HANDLER.test(tag.attributes),
    message: (tag) => `обработчик в атрибуте <${tag.name}> нельзя: события вешает скрипт секции`,
  },
  {
    broken: (tag) => SCRIPT_URL.test(tag.attributes),
    message: (tag) => `адрес javascript: в <${tag.name}> нельзя: действия — в скрипте секции`,
  },
];

const tagsOf = (text: string): OpenTag[] =>
  [...text.matchAll(OPEN_TAG)].map((match) => ({
    name: match[1].toLowerCase(),
    attributes: match[2],
    index: match.index,
  }));

export const templateProblems = (text: string): SectionProblem[] =>
  tagsOf(text).flatMap((tag) =>
    TAG_RULES.filter((rule) => rule.broken(tag)).map((rule) =>
      problem('template-forbidden', TEMPLATE_FILE, rule.message(tag), positionAt(text, tag.index)),
    ),
  );
