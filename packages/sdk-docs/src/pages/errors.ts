import { PROBLEM_CODES, PROBLEM_INFO } from '@merfy/storefront-sections';

// errors.md (блок 14): все коды проверки — из справки PROBLEM_INFO; якорь раздела — код.
const sectionOf = (code: (typeof PROBLEM_CODES)[number]): string => {
  const info = PROBLEM_INFO[code];
  const example =
    info.example === undefined ? '' : `\nПример: было \`${info.example.before}\` → стало \`${info.example.after}\`.\n`;
  return `## ${code}\n\nКогда: ${info.when}\n\nКак исправить: ${info.fix}.${example}`;
};

export function errorsPage(): string {
  return [
    'Справка по кодам проверки секции: когда бывает код и как исправить.',
    '',
    ...PROBLEM_CODES.map(sectionOf),
  ].join('\n\n');
}
