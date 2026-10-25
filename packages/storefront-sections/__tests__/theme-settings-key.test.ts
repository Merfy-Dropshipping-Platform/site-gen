import { describe, expect, it } from 'vitest';
import { sectionManifestSchema, type SectionManifest } from '../src/format';
import { NAMES } from '../src/names';
import { nameProblems } from '../src/script-names';

// Ключ themeSettings в section.json (блок 10 «Секций и SDK», 10.9, «Решил сам» п. 14; часть 10б, Р10б-11): поля
// «Настроек темы», которые конструктор показывает в панели секции. Имена — сквозные настройки (NAMES.shared).
const MANIFEST: SectionManifest = { sdk: 1, name: 'header', kind: 'section', title: 'Шапка', settings: [], uses: ['theme'] };
const BASE = { sdk: 1, name: 'header', kind: 'section', title: 'Шапка' };

const problemsOf = (themeSettings: string[]): string[] =>
  nameProblems({ manifest: { ...MANIFEST, themeSettings }, markup: { actions: [] }, facts: null, scriptEntry: null }).map(
    (item) => `${item.code} ${item.file} ${item.message}`,
  );

describe('themeSettings в section.json', () => {
  it('сквозная настройка wishlist-enabled есть в словаре', () => {
    expect(NAMES.shared.map((item) => item.id)).toContain('wishlist-enabled');
  });

  it('сквозные настройки — без проблем', () => {
    expect(problemsOf(['wishlist-enabled', 'cart-type'])).toEqual([]);
  });

  it('незнакомое имя — theme-setting-unknown в section.json, с похожим', () => {
    expect(problemsOf(['wishlist-enable'])).toEqual([
      expect.stringMatching(
        /^theme-setting-unknown section\.json themeSettings: настройки темы «wishlist-enable» нет\. Есть: .*\. Похожее: «wishlist-enabled»$/,
      ),
    ]);
  });

  it('форма: список kebab-case без повторов, до четырёх; иначе — ошибка схемы', () => {
    expect(sectionManifestSchema.safeParse({ ...BASE, themeSettings: ['wishlist-enabled'] }).success).toBe(true);
    for (const bad of [['a', 'a'], ['a', 'b', 'c', 'd', 'e'], 'wishlist-enabled', [1], ['Wishlist']])
      expect(sectionManifestSchema.safeParse({ ...BASE, themeSettings: bad }).success).toBe(false);
  });
});
