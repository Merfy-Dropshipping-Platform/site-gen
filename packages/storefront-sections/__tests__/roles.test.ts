import { SECTION_ROLES as SHELL_ROLES } from '@merfy/shell/roles';
import { OVERLAY_LIST as BUILD_OVERLAY_LIST, SPECIAL_PAGE_IDS } from '@merfy/storefront-build';
import { describe, expect, it } from 'vitest';
import { authorProblems } from '../src/author-rules';
import { readManifest, sectionGroupsOf, sectionLimitOf, sectionListAllowed, type SectionManifest } from '../src/format';
import { prepareSection } from '../src/prepare';
import { PROBLEM_CODES } from '../src/problems';
import { OVERLAY_LIST, ROLE_PLACES, SECTION_ROLES, roleKeysOf } from '../src/roles';

// Роли секций (блок 12 «Секций и SDK», 12.1, «Решил сам» пп. 1, 3–7; часть 12а) и правила секции расширения (12.8, пп.
// 30, 31): поле role в section.json, место по роли, отказы role-unknown, role-place, role-not-allowed, ext-foreign.
const manifestText = (extra: Record<string, unknown>, kind = 'section'): string =>
  JSON.stringify({ sdk: 1, name: 'cart-drawer', kind, title: 'Корзина-панель', ...extra });
const read = (extra: Record<string, unknown>) => readManifest({ 'section.json': manifestText(extra) });
const codesOf = (extra: Record<string, unknown>): string[] => {
  const result = read(extra);
  return result.ok ? [] : result.problems.map((item) => item.code);
};
const manifestOf = (extra: Record<string, unknown>): SectionManifest => {
  const result = read(extra);
  if (!result.ok) throw new Error(JSON.stringify(result.problems));
  return result.value;
};
// Отклонение от плана (RULES, правило с 24.10): expect.objectContaining возвращает any — типизированный хелпер;
// значения, коды и ожидания те же.
const textLike = (fragment: string): unknown => expect.stringContaining(fragment);
const problemLike = (code: string, fragment: string): unknown =>
  expect.objectContaining({ code, file: 'section.json', message: textLike(fragment) });

describe('таблица ролей', () => {
  it('семь ролей — тот же список, что у ядра; пять новых кодов проверки', () => {
    expect(SECTION_ROLES).toBe(SHELL_ROLES);
    expect(Object.keys(ROLE_PLACES)).toEqual([...SECTION_ROLES]);
    for (const code of ['role-unknown', 'role-place', 'role-not-allowed', 'role-taken', 'ext-foreign'])
      expect(PROBLEM_CODES).toContain(code);
  });

  it('место: корзина и вход — свои особые страницы, остальные — overlay; запасной путь описан у каждой', () => {
    expect(Object.entries(ROLE_PLACES).map(([role, place]) => [role, place.group, place.list])).toEqual([
      ['cart', 'page', 'page-cart'],
      ['cart-drawer', 'overlay', 'overlay'],
      ['cart-added', 'overlay', 'overlay'],
      ['login', 'page', 'page-login'],
      ['search', 'overlay', 'overlay'],
      ['notices', 'overlay', 'overlay'],
      ['cookie-banner', 'overlay', 'overlay'],
    ]);
    expect(OVERLAY_LIST).toBe(BUILD_OVERLAY_LIST);
    for (const place of Object.values(ROLE_PLACES)) {
      if (place.group === 'page') expect(SPECIAL_PAGE_IDS).toContain(place.list);
      expect(place.fallback.length).toBeGreaterThan(0);
    }
  });

  it('поля для /sections: роль, список ревизии, группа и один экземпляр', () => {
    expect(roleKeysOf('cart-drawer')).toEqual({ role: 'cart-drawer', place: 'overlay', groups: ['overlay'], limit: 1 });
    expect(roleKeysOf('login')).toEqual({ role: 'login', place: 'page-login', groups: ['page'], limit: 1 });
  });
});

describe('role в section.json', () => {
  it.each(SECTION_ROLES)('%s: принимается без groups и limit; группа и limit — из таблицы', (role) => {
    const manifest = manifestOf({ role });
    expect(manifest.role).toBe(role);
    expect([sectionGroupsOf(manifest), sectionLimitOf(manifest)]).toEqual([[ROLE_PLACES[role].group], 1]);
  });

  it('groups и limit, совпадающие с ролью, — можно; не совпадают — role-place', () => {
    expect(codesOf({ role: 'cart', groups: ['page'], limit: 1 })).toEqual([]);
    expect(codesOf({ role: 'cart-drawer', groups: ['overlay'] })).toEqual([]);
    expect(codesOf({ role: 'cart-drawer', groups: ['footer'] })).toEqual(['role-place']);
    expect(codesOf({ role: 'notices', groups: ['overlay', 'page'] })).toEqual(['role-place']);
    expect(codesOf({ role: 'search', limit: 2 })).toEqual(['role-place']);
  });

  it('группа overlay без роли — role-place; неизвестная роль — role-unknown со списком ролей', () => {
    expect(codesOf({ groups: ['overlay'] })).toEqual(['role-place']);
    const unknown = read({ role: 'minicart' });
    expect(unknown.ok ? [] : unknown.problems).toEqual([problemLike('role-unknown', 'cart-drawer')]);
  });

  it('роль у глобального скрипта — manifest-invalid: места на странице у него нет', () => {
    const result = readManifest({ 'section.json': manifestText({ role: 'notices' }, 'global') });
    expect(result.ok ? [] : result.problems.map((item) => [item.code, item.message])).toEqual([
      ['manifest-invalid', 'role: у глобального скрипта нет места на странице'],
    ]);
  });
});

describe('список ревизии и место секции', () => {
  it('без роли — по groups: header, footer и overlay — свои списки, остальные — страницы', () => {
    const plain = manifestOf({});
    expect(['home', 'page-cart', 'footer', 'overlay'].map((list) => sectionListAllowed(plain, list))).toEqual([
      true,
      true,
      false,
      false,
    ]);
    expect(sectionLimitOf(plain)).toBeUndefined();
  });

  it('с ролью — только список роли', () => {
    const drawer = manifestOf({ role: 'cart-drawer' });
    expect(['overlay', 'footer', 'home'].map((list) => sectionListAllowed(drawer, list))).toEqual([true, false, false]);
    const cart = manifestOf({ role: 'cart', groups: ['page'] });
    expect(['page-cart', 'home', 'overlay'].map((list) => sectionListAllowed(cart, list))).toEqual([
      true,
      false,
      false,
    ]);
  });
});

describe('секция расширения', () => {
  it('роль — role-not-allowed; у секции магазина — можно', () => {
    const drawer = manifestOf({ role: 'cart-drawer' });
    expect(authorProblems(drawer, 'reviews').map((item) => item.code)).toEqual(['role-not-allowed']);
    expect(authorProblems(drawer, 'shop')).toEqual([]);
  });

  it('ctx.ext: свой id — можно, чужой — ext-foreign; секция магазина подключает любое расширение', () => {
    expect(authorProblems(manifestOf({ uses: ['ext:reviews'] }), 'reviews')).toEqual([]);
    expect(authorProblems(manifestOf({ uses: ['ext:reviews', 'ext:loyalty'] }), 'reviews')).toEqual([
      problemLike('ext-foreign', 'ext:loyalty'),
    ]);
    expect(authorProblems(manifestOf({ uses: ['ext:loyalty'] }), 'shop')).toEqual([]);
  });

  it('приём: роль у секции расширения — отказ; styles.css — file-unknown, отдельного кода нет (Р12а-6)', async () => {
    const files = {
      'section.json': manifestText({ role: 'cart-drawer' }),
      'template.astro': '<p>Корзина</p>',
      'styles.css': 'p{}',
    };
    const result = await prepareSection({ prefix: 'reviews', files });
    const codes = result.ok ? [] : result.problems.map((item) => item.code);
    expect(codes).toEqual(expect.arrayContaining(['file-unknown', 'role-not-allowed']));
    expect(codes.filter((code) => code.startsWith('ext-') || code.startsWith('style'))).toEqual([]);
  }, 30_000);
});
