import { describe, expect, it } from 'vitest';
import rulesJson from '../compare-rules.json';
import { comparePassports, verdictOf } from '../src/compare/compare';
import { parseRules } from '../src/compare/rules';
import { differenceCount, renderReport, verdictTitle } from '../src/report/report';
import type { Passport } from '../src/types';
import { broken, cleanPassport } from './support/passports';

const rules = parseRules(rulesJson);
const CHECKLIST = '<table class="checklist"><tr><td>samples-present</td></tr></table>';

function reportOf(before: Passport, after: Passport): string {
  const differences = comparePassports(before, after, rules);
  return renderReport({ verdict: verdictOf(differences), differences, before, after, checklist: CHECKLIST });
}

describe('renderReport', () => {
  it('чистый прогон: «Чисто: прогоны совпадают» и «Отличий нет»', () => {
    const html = reportOf(cleanPassport(), cleanPassport());
    expect(html).toContain('<h1>Чисто: прогоны совпадают</h1>');
    expect(html).toContain('<p>Отличий нет.</p>');
  });

  it('красный: в заголовке число отличий словами', () => {
    expect(reportOf(cleanPassport(), broken('global', 'cart'))).toContain('<h1>Красный: 3 отличия</h1>');
  });

  it('жёлтый: правка цвета из панели', () => {
    expect(reportOf(cleanPassport(), broken('panel'))).toContain('<h1>Жёлтый: 2 отличия</h1>');
  });

  it('строка отличия: серьёзность, поле, что случилось, значение и причина', () => {
    const html = reportOf(cleanPassport(), broken('global'));
    expect(html).toContain('<li class="red"><span class="severity">красный</span>');
    expect(html).toContain(
      '<b>Глобалы __MERFY_*__:</b> появилось <code>__MERFY_SITE_ID__ = &quot;demo-site&quot;</code>',
    );
    expect(html).toContain('<div class="why">На стенде глобалов нет (И9): данные приходят из конфига и SDK.</div>');
  });

  it('«поменялось» показывает пару «было → стало»', () => {
    expect(reportOf(cleanPassport(), broken('panel'))).toContain('<code>--primary: #111111 → #e91e8c</code>');
  });

  it('у множества значение не повторяется: только имя ключа', () => {
    expect(reportOf(cleanPassport(), broken('cart'))).toContain('пропало <code>local:merfy:cartId</code>');
  });

  it('текст со страницы экранируется: тег из ошибки не становится тегом', () => {
    const after = cleanPassport();
    after.errors.push('<img src=x onerror=alert(1)>');
    const html = reportOf(cleanPassport(), after);
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
    expect(html).not.toContain('<img src=x');
  });

  it('оба паспорта — в отчёте целиком', () => {
    const html = reportOf(cleanPassport(), broken('panel'));
    expect(html).toContain('&quot;--primary&quot;: &quot;#111111&quot;');
    expect(html).toContain('&quot;--primary&quot;: &quot;#e91e8c&quot;');
  });

  it('чек-лист встроен в отчёт как есть', () => {
    expect(reportOf(cleanPassport(), cleanPassport())).toContain(`<h2>Чек-лист тестировщика</h2>${CHECKLIST}`);
  });
});

describe('verdictTitle и differenceCount', () => {
  it('склоняет «отличие» по числу', () => {
    expect([1, 2, 5, 11, 21, 22].map(differenceCount)).toEqual([
      '1 отличие',
      '2 отличия',
      '5 отличий',
      '11 отличий',
      '21 отличие',
      '22 отличия',
    ]);
  });

  it('заголовок вердикта для команды', () => {
    expect(verdictTitle('clean', 0)).toBe('Чисто: прогоны совпадают');
    expect(verdictTitle('red', 5)).toBe('Красный: 5 отличий');
    expect(verdictTitle('amber', 1)).toBe('Жёлтый: 1 отличие');
  });
});
