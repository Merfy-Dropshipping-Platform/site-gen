import { describe, expect, it } from 'vitest';
import { newRow } from '../src/accept';
import type { PreparedSection } from '../src/prepare';

// Хеш версии секции (п. 7 design.md блока 1 «Секций и SDK») — от того, что написал автор: имя, манифест, шаблон и
// скрипт. Модуля рендера в нём нет: новая версия Astro компилирует модуль заново, а версия секции та же. Отпечаток
// модуля — отдельно: по нему процесс рендера узнаёт модуль, сборка сверяет байты.
const DOOR = { author: 'shop', prefix: 'shop', owner: '00000000-0000-4000-8000-0000000000aa', release: null } as const;
const FILES = { 'section.json': '{"sdk":1,"name":"hero"}', 'template.astro': '<h2>{settings.heading}</h2>' };

const prepared = (change: { template?: string; render?: string } = {}): PreparedSection => ({
  name: 'shop:hero',
  manifest: {
    sdk: 1,
    name: 'hero',
    kind: 'section',
    title: 'Первый экран',
    settings: [],
  },
  template: change.template ?? '<h2>{settings.heading}</h2>',
  render: change.render ?? 'export default 1; // Astro 7.4.0',
  script: null,
  warnings: [],
});

describe('хеш версии секции', () => {
  it('модуль рендера другой (новая версия Astro) — версия секции та же, отпечаток модуля другой', () => {
    const before = newRow(DOOR, prepared(), FILES, null);
    const after = newRow(DOOR, prepared({ render: 'export default 1; // Astro 7.5.0' }), FILES, null);
    expect(after.contentHash).toBe(before.contentHash);
    expect(after.renderHash).not.toBe(before.renderHash);
  });

  it('шаблон другой — версия секции другая', () => {
    const before = newRow(DOOR, prepared(), FILES, null);
    const after = newRow(DOOR, prepared({ template: '<h3>{settings.heading}</h3>' }), FILES, null);
    expect(after.contentHash).not.toBe(before.contentHash);
  });
});
