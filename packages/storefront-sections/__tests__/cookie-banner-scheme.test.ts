import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

// Схема баннера cookie — токен темы `scheme-cookie-banner` (блок 12, часть 12г, Р12г-13): класс на корне баннера, общей
// настройки схемы у секции нет. Какая именно схема — выбор мерчанта в «Настройках темы → Баннер → Цветовая схема»; пустое
// значение и схему по умолчанию выбирает CSS токенов темы, поэтому класс стоит всегда.
const SECTION = new URL('../fixtures/shop/cookie-banner/', import.meta.url);
const manifest = JSON.parse(readFileSync(new URL('section.json', SECTION), 'utf8')) as { wrapper?: string[] };
const template = readFileSync(new URL('template.astro', SECTION), 'utf8');
const PANEL = new URL('../../theme-contract/panel/theme-panel.json', import.meta.url);

describe('схема баннера cookie', () => {
  it('класс схемы стоит на корне баннера и не зависит от настроек', () => {
    const root = template.split('\n').find((line) => line.includes('data-ref="banner"')) ?? '';
    expect(root).toContain("'scheme-cookie-banner ");
    expect(template).not.toMatch(/theme\[|settings\.scheme/);
  });

  it('у секции нет общих настроек схемы и отступов: баннер закреплён, схему задаёт тема', () => {
    expect(manifest.wrapper).toEqual([]);
  });

  it('поле панели «Цветовая схема» баннера — токен этого же класса', () => {
    const panel = JSON.parse(readFileSync(PANEL, 'utf8')) as {
      groups: { id: string; fields: { id: string; token?: string; control?: string }[] }[];
    };
    const field = panel.groups.find((group) => group.id === 'banner')?.fields.find((item) => item.id === 'cookie-banner-scheme');
    expect(field).toMatchObject({ token: 'scheme-cookie-banner', control: 'scheme' });
  });
});
