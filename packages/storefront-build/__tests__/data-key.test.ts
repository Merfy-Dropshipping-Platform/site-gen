import { describe, expect, it } from 'vitest';
import standInputsJson from '../fixtures/stand-inputs.json';
import { parseBuildInputs, type BuildInputs, type CodeSection } from '../src/inputs';
import { buildKey, dataKey } from '../src/key';

// Ключ данных (блок 10, задача 11): код платформы в него не входит, от расширений — только имена секций.
const INPUTS = parseBuildInputs(standInputsJson);
const OTHER = `sha256:${'e'.repeat(64)}`;
const HASH_A = `sha256:${'a'.repeat(64)}`;
const HASH_B = `sha256:${'b'.repeat(64)}`;
const section = (name: string, hash = OTHER): CodeSection => ({
  name,
  kind: 'section',
  hash,
  render: null,
  script: null,
});
const withCode = (sections: CodeSection[], globals: string[] = []): BuildInputs => ({
  ...INPUTS,
  code: {
    ...INPUTS.code,
    sections: [...INPUTS.code.sections, ...sections],
    globals: [...INPUTS.code.globals, ...globals],
  },
});
const reviews = (hash: string): BuildInputs =>
  withCode(
    [section('reviews:stars', hash), { ...section('reviews:widget', hash), kind: 'global' }],
    ['reviews:widget'],
  );

const newPlatform: BuildInputs = {
  ...INPUTS,
  platform: { renderHash: OTHER },
  shell: { version: '9.9.9', hash: OTHER, parts: ['cart'] },
};

describe('dataKey', () => {
  it('другой только код платформы: renderHash и ядро — ключ данных тот же, ключ сборки другой', () => {
    expect(dataKey(newPlatform)).toBe(dataKey(INPUTS));
    expect(buildKey(newPlatform)).not.toBe(buildKey(INPUTS));
  });

  it('правка мерчанта или своя секция магазина — ключ данных другой', () => {
    const edited: BuildInputs = { ...INPUTS, revision: { tokens: { root: { 'color-primary': '#123456' } } } };
    expect(dataKey(edited)).not.toBe(dataKey(INPUTS));
    expect(dataKey(withCode([section('shop:banner')]))).not.toBe(dataKey(INPUTS));
  });

  it('новая версия расширения — ключ данных тот же, ключ сборки другой', () => {
    expect(dataKey(reviews(HASH_B))).toBe(dataKey(reviews(HASH_A)));
    expect(buildKey(reviews(HASH_B))).not.toBe(buildKey(reviews(HASH_A)));
  });

  it('включили или выключили расширение, сменили закрепление темы, другая правка своей секции — ключ данных другой', () => {
    const pinned: BuildInputs = { ...INPUTS, theme: { ...INPUTS.theme, version: '9.9.9', contentHash: OTHER } };
    const themeSection = (hash: string) => withCode([section('shop:scarf', hash)]);
    expect(dataKey(reviews(HASH_A))).not.toBe(dataKey(INPUTS));
    expect(dataKey(pinned)).not.toBe(dataKey(INPUTS));
    expect(dataKey(themeSection(HASH_A))).not.toBe(dataKey(themeSection(HASH_B)));
  });
});
