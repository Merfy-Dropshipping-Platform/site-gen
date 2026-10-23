import { buildKey, dataKey, parseBuildInputs, type BuildInputs } from '@merfy/storefront-build';
import { describe, expect, it } from 'vitest';
import standInputsJson from '../../storefront-build/fixtures/stand-inputs.json';
import { staleAgainst } from '../src/reconcile';

// Сверка раз в час (блок 6) после блока 10 ищет потерянные события, а не новый код платформы.
const INPUTS = parseBuildInputs(standInputsJson);
const OTHER = `sha256:${'e'.repeat(64)}`;
const newPlatform: BuildInputs = {
  ...INPUTS,
  platform: { renderHash: OTHER },
  shell: { version: '9.9.9', hash: OTHER, parts: ['cart'] },
};
const edited: BuildInputs = { ...INPUTS, revision: { tokens: { root: { 'color-primary': '#123456' } } } };
const pinned: BuildInputs = { ...INPUTS, theme: { ...INPUTS.theme, version: '9.9.9', contentHash: OTHER } };
const withReviews = (hash: string): BuildInputs => ({
  ...INPUTS,
  code: {
    ...INPUTS.code,
    sections: [...INPUTS.code.sections, { name: 'reviews:stars', kind: 'section', hash, render: null, script: null }],
  },
});
const liveOf = (built: BuildInputs, withDataKey = true) => ({
  key: buildKey(built),
  dataKey: withDataKey ? dataKey(built) : undefined,
  platform: { commit: 'c'.repeat(40), renderHash: built.platform.renderHash },
});

describe('staleAgainst (блок 10)', () => {
  it('живой сборки нет — расхождение', () => {
    expect(staleAgainst(null, INPUTS)).toBe(true);
  });

  it('другая только платформа — не расхождение', () => {
    expect(staleAgainst(liveOf(INPUTS), newPlatform)).toBe(false);
  });

  it('данные другие — расхождение', () => {
    expect(staleAgainst(liveOf(INPUTS), edited)).toBe(true);
  });

  it('сборка до ключа данных: та же платформа и другие данные — расхождение; другая платформа — нет', () => {
    expect(staleAgainst(liveOf(INPUTS, false), edited)).toBe(true);
    expect(staleAgainst(liveOf(INPUTS, false), newPlatform)).toBe(false);
  });

  it('новая версия расширения — не расхождение: её разносит выпуск расширения', () => {
    const v1 = withReviews(`sha256:${'a'.repeat(64)}`);
    const v2 = withReviews(`sha256:${'b'.repeat(64)}`);
    expect(staleAgainst(liveOf(v1), v2)).toBe(false);
  });

  it('включили или выключили расширение, сменили закрепление темы — расхождение', () => {
    const enabled = withReviews(OTHER);
    expect(staleAgainst(liveOf(INPUTS), enabled)).toBe(true);
    expect(staleAgainst(liveOf(enabled), INPUTS)).toBe(true);
    expect(staleAgainst(liveOf(INPUTS), pinned)).toBe(true);
  });
});
