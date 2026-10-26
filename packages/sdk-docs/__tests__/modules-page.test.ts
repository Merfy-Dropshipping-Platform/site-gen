import { MODULE_NAMES } from '@merfy/shell/actions';
import coreParts from '@merfy/shell/core-parts.json';
import { describe, expect, it } from 'vitest';
import { modulesPage } from '../src/pages/modules';

// modules.md (блок 15 «Секций и SDK», часть 15ж, Р15ж-10): у каждого модуля — что даёт и в бандле каких страниц;
// модули ядра — по core-parts.json, остальные — по uses и data-action.
const page = modulesPage();
const sectionOf = (name: string): string => page.split(`## ${name}\n`)[1]?.split('\n## ')[0] ?? '';

describe('modules.md', () => {
  it('раздел у каждого модуля SDK', () => {
    for (const name of MODULE_NAMES) expect(page, name).toContain(`## ${name}\n`);
  });

  it('модули ядра — в бандле каждой страницы, остальные — только страниц, где секция объявила', () => {
    const core: readonly string[] = coreParts.core;
    for (const name of MODULE_NAMES)
      expect(sectionOf(name), name).toContain(core.includes(name) ? 'бандле каждой страницы' : 'бандле только страниц, где секция объявила');
  });

  it('customer — «кто вошёл» для шапки; auth — вход по коду, выход, профиль и совет взять customer', () => {
    expect(sectionOf('customer')).toContain('$customer');
    expect(sectionOf('auth')).toContain('requestCode');
    expect(sectionOf('auth')).toContain('`customer`');
  });
});
