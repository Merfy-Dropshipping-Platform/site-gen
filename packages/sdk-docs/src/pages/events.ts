import { ERROR_CODES, EVENT_CATALOG } from '@merfy/shell/events';

// events.md (блок 14): события витрины из каталога EVENT_CATALOG и коды ошибок.
type StringRule = 'text' | 'text-or-null' | 'count' | 'money';

const RULE_TEXT: Readonly<Record<StringRule, string>> = {
  text: 'строка',
  'text-or-null': 'строка или null',
  count: 'целое от 0',
  money: '{ amount, currency }',
};

const fieldText = (rule: unknown): string => {
  if (typeof rule === 'string') {
    const named: unknown = Reflect.get(RULE_TEXT, rule);
    return typeof named === 'string' ? named : '';
  }
  if (typeof rule !== 'object' || rule === null) return '';
  const oneOf: unknown = Reflect.get(rule, 'oneOf');
  const values = Array.isArray(oneOf) ? oneOf.join(', ') : '';
  const optional = Reflect.get(rule, 'optional') === true ? ', может не быть' : '';
  return `одно из: ${values}${optional}`;
};

const fieldsText = (fields: Readonly<Record<string, unknown>>): string => {
  const entries = Object.entries(fields).map(([name, rule]) => `${name} — ${fieldText(rule)}`);
  return entries.length === 0 ? '—' : entries.join('; ');
};

export function eventsPage(): string {
  const rows = Object.entries(EVENT_CATALOG).map(
    ([name, spec]) => `| \`${name}\` | ${spec.about} | ${fieldsText(spec.fields)} |`,
  );
  return [
    'События витрины отправляет ядро SDK; секция слушает их через `ctx.listen`, свой код мерчанта — на `document`.',
    '',
    '| Событие | Что случилось | Поля события |',
    '|---|---|---|',
    ...rows,
    '',
    '## Коды ошибок',
    '',
    `В данных событий \`merfy:notice:show\` и \`merfy:section:error\` поле code — одно из: ${ERROR_CODES.join(', ')}.`,
  ].join('\n');
}
