import { describe, expect, it } from 'vitest';
import rulesJson from '../compare-rules.json';
import { parseRules } from '../src/compare/rules';

// Таблица design.md 5.4: появилось / пропало / поменялось; «—» — такого отличия у поля не бывает.
const TABLE_5_4 = {
  scripts: ['red', 'red', 'amber'],
  globals: ['red', 'red', 'red'],
  storage: ['red', 'red', '—'],
  cookies: ['red', 'red', '—'],
  requests: ['amber', 'amber', 'red'],
  errors: ['red', 'amber', '—'],
  tokens: ['amber', 'red', 'amber'],
  fonts: ['amber', 'red', '—'],
};

describe('compare-rules.json', () => {
  it('совпадает с таблицей design.md 5.4', () => {
    const rows = parseRules(rulesJson).map((rule) => [
      rule.field,
      [rule.severity.added ?? '—', rule.severity.removed ?? '—', rule.severity.changed ?? '—'],
    ]);
    expect(Object.fromEntries(rows)).toEqual(TABLE_5_4);
  });

  it('скрипты и запросы — списки по src и url, глобалы и токены — map, остальное — set', () => {
    const shapes = parseRules(rulesJson).map((rule) => `${rule.field}:${rule.shape}:${rule.key ?? ''}`);
    expect(shapes).toEqual([
      'scripts:list:src',
      'globals:map:',
      'storage:set:',
      'cookies:set:',
      'requests:list:url',
      'errors:set:',
      'tokens:map:',
      'fonts:set:',
    ]);
  });
});

describe('parseRules: ошибки называют поле', () => {
  it('нет правила для поля', () => {
    const rules = rulesJson.rules.filter((rule) => rule.field !== 'fonts');
    expect(() => parseRules({ rules })).toThrow(/^rules-invalid: правила сравнения:\nrules: fonts: нет правила/);
  });

  it('правило для поля записано дважды', () => {
    const rules = [...rulesJson.rules, rulesJson.rules[0]];
    expect(() => parseRules({ rules })).toThrow(/scripts: правило записано дважды/);
  });

  it('у списка нет key', () => {
    const rules = rulesJson.rules.map((rule) => (rule.field === 'scripts' ? { ...rule, key: undefined } : rule));
    expect(() => parseRules({ rules })).toThrow(/scripts: у списка нужен key/);
  });

  it('у множества задана серьёзность для «поменялось»', () => {
    const rules = rulesJson.rules.map((rule) =>
      rule.field === 'storage' ? { ...rule, severity: { ...rule.severity, changed: 'amber' } } : rule,
    );
    expect(() => parseRules({ rules })).toThrow(/storage: у вида set «поменялось» не бывает/);
  });

  it('нет серьёзности для «пропало»', () => {
    const rules = rulesJson.rules.map((rule) =>
      rule.field === 'scripts' ? { ...rule, severity: { added: 'red', changed: 'amber' } } : rule,
    );
    expect(() => parseRules({ rules })).toThrow(/scripts: нет серьёзности для «пропало»/);
  });
});
