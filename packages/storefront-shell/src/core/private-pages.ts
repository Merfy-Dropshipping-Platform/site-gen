import type { StorefrontConfig } from '@merfy/storefront-config';
import { tokenOf } from './customer-token';
import { navigation } from './navigation';
import type { KeyValue } from './storage';
import type { Mode } from './types';

// Страницы кабинета (блок 10, часть 10в, Р10в-9): постоянные id платформы (Р10а-14).
export const PRIVATE_PAGE_IDS: ReadonlySet<string> = new Set(['page-profile', 'page-orders']);

// Адрес возврата: путь страницы с параметрами — после входа покупательница вернётся сюда.
const returnToOf = (win: Window): string => `${win.location.pathname}${win.location.search}`;

// Гостья без токена на странице кабинета витрины: navigation.go('/login?redirect=<путь и параметры>'); true — секции не
// запускать. Превью, другая страница, нет конфига или есть токен — false.
export function leavePrivatePage(win: Window, config: StorefrontConfig | null, mode: Mode, page: KeyValue): boolean {
  if (config === null || mode !== 'live') return false;
  if (!PRIVATE_PAGE_IDS.has(config.page.id) || tokenOf(page) !== null) return false;
  navigation.go(`/login?redirect=${encodeURIComponent(returnToOf(win))}`);
  return true;
}
