import { ruleText } from '../derive';
import { dictionaryNames } from '../dictionary';
import { KINDS, classesOf, valueText } from '../kinds';
import type { Dictionary } from '../types';
import { GENERATED_NOTE } from './tailwind';

// Справочник TOKENS.md (design.md 8.7): одна строка на токен, в порядке словаря.

const NONE = '—';
const code = (text: string): string => `\`${text}\``;
const HEADER = ['| Токен | Вид | Для чего | Если не задан | Класс | Читается на |', '|---|---|---|---|---|---|'];

// «Если не задан»: умолчание — само значение, правило — словами, иначе «задаёт тема».
function fallbackCell(dictionary: Dictionary, name: string): string {
  const def = dictionary.tokens[name];
  return def.default === undefined ? ruleText(dictionary, name, code) : code(valueText(def.kind, def.default));
}

function row(dictionary: Dictionary, name: string): string {
  const def = dictionary.tokens[name];
  const cells = [
    code(name),
    KINDS[def.kind].label,
    def.about,
    fallbackCell(dictionary, name),
    classesOf(name, def).map(code).join(' '),
    def.on === undefined ? NONE : def.on.map(code).join(', '),
  ];
  return `| ${cells.join(' | ')} |`;
}

export function tokensMarkdown(dictionary: Dictionary): string {
  const rows = dictionaryNames(dictionary).map((name) => row(dictionary, name));
  return ['# Токены', '', GENERATED_NOTE, '', ...HEADER, ...rows, ''].join('\n');
}
