import { describe, expect, it } from 'vitest';
import samplesJson from '../scenarios/samples-present.json';
import { parseCompareArgs, parseRunArgs } from '../src/run/args';
import { EXIT_CODE, exitCodeOf, reportDirName, runScenarios } from '../src/run/outcome';
import { SABOTAGE, SABOTAGE_NAMES } from '../src/run/sabotage';
import { standUrl } from '../src/run/targets';
import { parseScenario } from '../src/scenario/schema';
import type { Scenario } from '../src/types';
import { cleanPassport } from './support/passports';

const noGlobals: Scenario = { ...parseScenario(samplesJson), id: 'no-globals', expect: [{ kind: 'no-globals' }] };

describe('parseRunArgs', () => {
  it('по умолчанию — local и без поломок', () => {
    expect(parseRunArgs([])).toEqual({ target: 'local', sabotage: [] });
  });

  it('--target dev и несколько --sabotage', () => {
    const args = parseRunArgs(['--target', 'dev', '--sabotage', 'global', '--sabotage', 'cart']);
    expect(args).toEqual({ target: 'dev', sabotage: ['global', 'cart'] });
  });

  it('незнакомое место прогона или поломка — ошибка args-invalid', () => {
    expect(() => parseRunArgs(['--target', 'prod'])).toThrow(/^args-invalid: .*\ntarget: /);
    expect(() => parseRunArgs(['--sabotage', 'all'])).toThrow(/sabotage\.0: /);
  });

  it('незнакомый ключ — ошибка', () => {
    expect(() => parseRunArgs(['--colour', 'red'])).toThrow(/--colour/);
  });
});

describe('parseCompareArgs', () => {
  it('два файла паспортов', () => {
    expect(parseCompareArgs(['a.json', 'b.json'])).toEqual({ first: 'a.json', second: 'b.json' });
  });

  it('один файл — ошибка', () => {
    expect(() => parseCompareArgs(['a.json'])).toThrow(/^args-invalid: нужны два файла паспортов \.json/);
  });
});

describe('standUrl', () => {
  it('локально — preview темы nova на порту 4321', () => {
    expect(standUrl('local', {})).toBe('http://localhost:4321/theme-stand');
  });

  it('dev — адрес тестового магазина из STAND_DEV_URL', () => {
    expect(standUrl('dev', { STAND_DEV_URL: 'https://shop.dev.merfy.ru/' })).toBe(
      'https://shop.dev.merfy.ru/theme-stand',
    );
  });

  it('dev без STAND_DEV_URL — ошибка env-missing', () => {
    expect(() => standUrl('dev', {})).toThrow(/^env-missing: нужна переменная окружения STAND_DEV_URL/);
  });
});

describe('runScenarios и exitCodeOf', () => {
  it('сценарий прошёл — итог для чек-листа без провалов', () => {
    const outcome = runScenarios([noGlobals], 'local', { passport: cleanPassport(), sections: [] });
    expect(outcome.runs).toEqual([{ scenario: noGlobals, target: 'local', ok: true }]);
    expect(outcome.failures).toEqual([]);
  });

  it('проваленная проверка — строка с сценарием, видом и подробностью', () => {
    const passport = { ...cleanPassport(), globals: { __MERFY_SITE_ID__: '"x"' } };
    const outcome = runScenarios([noGlobals], 'local', { passport, sections: [] });
    expect(outcome.failures).toEqual(['no-globals · no-globals: глобалы: __MERFY_SITE_ID__']);
  });

  it('сценарий другой страницы — провал с объяснением', () => {
    const outcome = runScenarios([{ ...noGlobals, open: '/cart' }], 'local', {
      passport: cleanPassport(),
      sections: [],
    });
    expect(outcome.failures).toEqual(['no-globals: сценарий открывает /cart, а прогон снят с /theme-stand']);
  });

  it('код выхода: красный или проваленный сценарий — 1, иначе 0', () => {
    const passed = [{ scenario: noGlobals, target: 'local' as const, ok: true }];
    const failed = [{ scenario: noGlobals, target: 'local' as const, ok: false }];
    expect(exitCodeOf('clean', passed)).toBe(EXIT_CODE.pass);
    expect(exitCodeOf('amber', passed)).toBe(EXIT_CODE.pass);
    expect(exitCodeOf('red', passed)).toBe(EXIT_CODE.red);
    expect(exitCodeOf('clean', failed)).toBe(EXIT_CODE.red);
  });
});

describe('reportDirName и SABOTAGE', () => {
  it('папка отчёта — время прогона до миллисекунд, без двоеточий', () => {
    expect(reportDirName(new Date('2026-10-06T12:30:05.123Z'))).toBe('2026-10-06T12-30-05-123');
  });

  it('три поломки приёмки — у каждой свой скрипт', () => {
    expect(SABOTAGE_NAMES).toEqual(['script', 'global', 'cart']);
    expect(SABOTAGE.global).toContain('__MERFY_SITE_ID__');
    expect(SABOTAGE.cart).toContain("localStorage.setItem('cart:v2'");
    expect(SABOTAGE.script).toContain("document.createElement('script')");
  });
});
