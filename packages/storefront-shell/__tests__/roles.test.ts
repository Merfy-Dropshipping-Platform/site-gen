import { afterEach, describe, expect, it } from 'vitest';
import { ROLE_ATTRIBUTE, SECTION_ROLES, isSectionRole, roleSection, roleWorks } from '../src/core/roles';

// Роли секций в ядре (блок 12 «Секций и SDK», 12.1, «Решил сам» пп. 1, 6; часть 12а): семь ролей платформы; секция — по
// data-role на обёртке экземпляра, а не по имени; сбой экземпляра (data-merfy-state="failed") — секция не работает.
afterEach(() => {
  document.body.replaceChildren();
});

describe('роли в ядре', () => {
  it('семь ролей платформы; чужое значение — не роль', () => {
    expect(SECTION_ROLES).toEqual(['cart', 'cart-drawer', 'cart-added', 'login', 'search', 'notices', 'cookie-banner']);
    expect([isSectionRole('cart-drawer'), isSectionRole('minicart'), isSectionRole(1)]).toEqual([true, false, false]);
    expect(ROLE_ATTRIBUTE).toBe('data-role');
  });

  it('секция по data-role, имя любое; нет — null; сбой — не работает', () => {
    expect([roleSection(document, 'cart-drawer'), roleWorks(document, 'cart-drawer')]).toEqual([null, false]);
    document.body.innerHTML =
      '<merfy-section data-section="shop:my-cart" data-section-id="my-cart-1" data-role="cart-drawer"></merfy-section>' +
      '<merfy-section data-section="shop:search" data-section-id="search-1"></merfy-section>';
    expect(roleSection(document, 'cart-drawer')?.dataset.section).toBe('shop:my-cart');
    expect([roleWorks(document, 'cart-drawer'), roleWorks(document, 'search')]).toEqual([true, false]);
    roleSection(document, 'cart-drawer')?.setAttribute('data-merfy-state', 'failed');
    expect(roleWorks(document, 'cart-drawer')).toBe(false);
    roleSection(document, 'cart-drawer')?.setAttribute('data-merfy-state', 'mounted');
    expect(roleWorks(document, 'cart-drawer')).toBe(true);
  });
});
