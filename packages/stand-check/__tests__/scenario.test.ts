import { describe, expect, it } from 'vitest';
import samplesJson from '../scenarios/samples-present.json';
import { checkScenario, tokensPresent } from '../src/scenario/checks';
import { parseScenario } from '../src/scenario/schema';
import { TOKEN_SETS } from '../src/token-sets';
import type { Expectation, Passport, Scenario } from '../src/types';
import { cleanPassport } from './support/passports';

const scenarioWith = (...expect: Expectation[]): Scenario => ({
  id: 'test',
  title: 'Тест',
  since: 'задача 1',
  open: '/theme-stand',
  steps: [],
  expect,
  eyes: [],
});

const facts = (passport: Passport, sections: string[] = []) => ({ passport, sections });
const SECTIONS = ['schemes', 'type-scale', 'radii-spacing', 'shadows', 'controls', 'price'];

describe('parseScenario', () => {
  it('samples-present.json разбирается: пять проверок, шагов нет', () => {
    const scenario = parseScenario(samplesJson);
    expect(scenario.expect.map((expectation) => expectation.kind)).toEqual([
      'tokens-present',
      'sections-present',
      'fonts-loaded',
      'no-errors',
      'no-globals',
    ]);
    expect(scenario.steps).toEqual([]);
  });

  it('шагов пока нет: сценарий с шагом не проходит схему', () => {
    const raw = { ...samplesJson, steps: [{ action: 'cart.add' }] };
    expect(() => parseScenario(raw)).toThrow(/^scenario-invalid: сценарий:\nsteps: /);
  });

  it('незнакомый вид проверки не проходит схему', () => {
    const raw = { ...samplesJson, expect: [{ kind: 'looks-nice' }] };
    expect(() => parseScenario(raw)).toThrow(/expect\.0/);
  });
});

describe('checkScenario: tokens-present', () => {
  it('все токены набора на :root — проходит', () => {
    const result = tokensPresent('base', ['--background', '--radius-button'], cleanPassport().tokens);
    expect(result).toEqual({ kind: 'tokens-present', ok: true, detail: 'на :root есть все токены набора base: 2' });
  });

  it('токена нет на :root — не проходит и называет его', () => {
    const result = tokensPresent('base', ['--background', '--shadow-card'], cleanPassport().tokens);
    expect(result).toEqual({ kind: 'tokens-present', ok: false, detail: 'на :root не хватает: --shadow-card' });
  });

  it('пустой набор не проходит: образцов ещё нет', () => {
    expect(tokensPresent('base', [], cleanPassport().tokens)).toEqual({
      kind: 'tokens-present',
      ok: false,
      detail: 'набор base пуст: образцов токенов на стенде ещё нет',
    });
  });

  it('сценарий берёт имена из набора TOKEN_SETS', () => {
    const passport = cleanPassport();
    const [result] = checkScenario(scenarioWith({ kind: 'tokens-present', set: 'base' }), facts(passport));
    expect(result).toEqual(tokensPresent('base', TOKEN_SETS.base, passport.tokens));
  });
});

describe('checkScenario: sections-present', () => {
  it('sections-present: все разделы на месте — проходит', () => {
    const scenario = scenarioWith({ kind: 'sections-present', ids: SECTIONS });
    const [result] = checkScenario(scenario, facts(cleanPassport(), [...SECTIONS, 'extra']));
    expect(result.ok).toBe(true);
  });

  it('sections-present: раздела нет — не проходит и называет его', () => {
    const scenario = scenarioWith({ kind: 'sections-present', ids: SECTIONS });
    const [result] = checkScenario(scenario, facts(cleanPassport(), SECTIONS.slice(0, 5)));
    expect(result).toEqual({ kind: 'sections-present', ok: false, detail: 'нет разделов: price' });
  });
});

describe('checkScenario: fonts-loaded', () => {
  const scenario = scenarioWith({ kind: 'fonts-loaded' });

  it('шрифт из --font-body загружен — проходит', () => {
    const passport = { ...cleanPassport(), tokens: { '--font-body': '"Manrope", system-ui, sans-serif' } };
    const [result] = checkScenario(scenario, facts(passport));
    expect(result).toEqual({ kind: 'fonts-loaded', ok: true, detail: 'шрифт текста Manrope загружен' });
  });

  it('шрифт текста не загружен — не проходит и показывает, что загружено', () => {
    const passport = {
      ...cleanPassport(),
      tokens: { '--font-body': 'Manrope, sans-serif' },
      fonts: ['Inter 400 normal'],
    };
    const [result] = checkScenario(scenario, facts(passport));
    expect(result).toEqual({
      kind: 'fonts-loaded',
      ok: false,
      detail: 'Manrope не загружен; загружены: Inter 400 normal',
    });
  });

  it('на :root нет --font-body — не проходит', () => {
    const [result] = checkScenario(scenario, facts({ ...cleanPassport(), tokens: {} }));
    expect(result).toEqual({ kind: 'fonts-loaded', ok: false, detail: 'на :root нет --font-body: какой шрифт ждать?' });
  });
});

describe('checkScenario: no-errors и no-globals', () => {
  it('no-errors: ошибок нет — проходит; есть — не проходит и показывает их', () => {
    const scenario = scenarioWith({ kind: 'no-errors' });
    expect(checkScenario(scenario, facts(cleanPassport()))[0].ok).toBe(true);
    const [failed] = checkScenario(scenario, facts({ ...cleanPassport(), errors: ['TypeError: x'] }));
    expect(failed).toEqual({ kind: 'no-errors', ok: false, detail: 'ошибок 1: TypeError: x' });
  });

  it('no-globals: глобалов нет — проходит; есть — не проходит и называет их', () => {
    const scenario = scenarioWith({ kind: 'no-globals' });
    expect(checkScenario(scenario, facts(cleanPassport()))[0].ok).toBe(true);
    const passport = { ...cleanPassport(), globals: { __MERFY_SITE_ID__: '"demo"' } };
    const [failed] = checkScenario(scenario, facts(passport));
    expect(failed).toEqual({ kind: 'no-globals', ok: false, detail: 'глобалы: __MERFY_SITE_ID__' });
  });

  it('длинный список сокращается: пять имён и «ещё N»', () => {
    const errors = ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7'];
    const [result] = checkScenario(scenarioWith({ kind: 'no-errors' }), facts({ ...cleanPassport(), errors }));
    expect(result.detail).toBe('ошибок 7: e1, e2, e3, e4, e5 и ещё 2');
  });

  it('итоги идут в порядке проверок сценария', () => {
    const scenario = scenarioWith({ kind: 'no-globals' }, { kind: 'no-errors' }, { kind: 'fonts-loaded' });
    const kinds = checkScenario(scenario, facts(cleanPassport())).map((result) => result.kind);
    expect(kinds).toEqual(['no-globals', 'no-errors', 'fonts-loaded']);
  });
});
