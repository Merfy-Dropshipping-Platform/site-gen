import { describe, expect, it } from 'vitest';
import { currentSection } from '../src/current';
import type { SectionRow } from '../src/registry';

const MANIFEST = { sdk: 1, name: 'hero', kind: 'section', title: 'Первый экран', settings: [] };

const row = (fields: Partial<SectionRow>): SectionRow => ({
  id: '00000000-0000-4000-8000-000000000001',
  name: 'shop:hero',
  kind: 'section',
  author: 'shop',
  owner: '00000000-0000-4000-8000-0000000000aa',
  release: null,
  sourceHash: 'sha256:a',
  contentHash: 'sha256:b',
  manifest: MANIFEST,
  template: '<p></p>',
  style: '',
  render: 'export default 1;',
  renderHash: 'sha256:c',
  script: null,
  scriptHash: null,
  warnings: [],
  draft: true,
  published: true,
  createdAt: '2026-10-18T00:00:00.000Z',
  ...fields,
});

describe('строка реестра в формате SDK 1', () => {
  it('секция — имя, манифест и модуль рендера', () => {
    expect(currentSection(row({}))).toEqual({
      name: 'shop:hero',
      manifest: MANIFEST,
      render: 'export default 1;',
      renderHash: 'sha256:c',
    });
  });

  it('манифест до SDK 1 — null', () => {
    expect(currentSection(row({ manifest: { v: 1, name: 'hero', kind: 'section', title: 'Первый экран' } }))).toBeNull();
  });

  it('секция без модуля рендера — null', () => {
    expect(currentSection(row({ render: null, renderHash: null }))).toBeNull();
  });

  it('глобальный скрипт без модуля рендера — годится', () => {
    const manifest = { ...MANIFEST, name: 'analytics', kind: 'global' };
    const global = row({ name: 'shop:analytics', kind: 'global', manifest, render: null, renderHash: null });
    expect(currentSection(global)?.renderHash).toBeNull();
  });
});
