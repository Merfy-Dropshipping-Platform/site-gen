// Кто чинит находку (`fix`): значение по месту проверки, одна таблица `FIX_BY_PLACE`; проверка может задать своё.
import { describe, expect, it } from 'vitest';
import { FIX_BY_PLACE, grouped, type CheckPlace, type CheckFix, type FindingDraft } from '../src/checks/finding';

const draft = (place: CheckPlace, patch: Partial<FindingDraft> = {}): FindingDraft => ({
  place,
  check: 'demo',
  rule: 'demo-rule',
  level: 'warning',
  section: 'hero-1',
  where: 'h2',
  text: 'что не так · как починить',
  ...patch,
});

describe('fix по месту проверки', () => {
  const expected: Array<[CheckPlace, CheckFix]> = [
    ['code', 'silent'],
    ['html', 'silent'],
    ['browser', 'silent'],
    ['audit', 'silent'],
    ['shop', 'ask'],
    ['release', 'platform'],
  ];

  it.each(expected)('место %s — %s', (place, fix) => {
    expect(FIX_BY_PLACE[place]).toBe(fix);
    expect(grouped([draft(place)])[0]?.fix).toBe(fix);
  });

  it('таблица покрывает все места проверок', () => {
    expect(Object.keys(FIX_BY_PLACE).sort()).toEqual(expected.map(([place]) => place).sort());
  });

  it('проверка может переопределить значение своей находки', () => {
    const [found] = grouped([draft('browser', { fix: 'ask' })]);
    expect(found?.fix).toBe('ask');
  });

  it('находки с разным fix в одной секции не склеиваются', () => {
    const found = grouped([draft('browser'), draft('browser', { fix: 'ask' }), draft('browser')]);
    expect(found.map((entry) => [entry.fix, entry.count])).toEqual([
      ['silent', 2],
      ['ask', 1],
    ]);
  });
});
