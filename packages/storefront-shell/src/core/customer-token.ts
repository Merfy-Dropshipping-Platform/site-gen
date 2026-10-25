import type { KeyValue } from './storage';

// Токен покупательницы (блок 10, п. 17; каркас, блок 7, п. 3): тот же ключ читает нынешнее оформление.
export const CUSTOMER_TOKEN_KEY = 'merfy_customer_token';

// Токен из хранилища страницы: пустая строка — токена нет.
export function tokenOf(page: KeyValue): string | null {
  const value = page.getItem(CUSTOMER_TOKEN_KEY);
  return value === null || value === '' ? null : value;
}

export function saveToken(page: KeyValue, token: string): void {
  page.setItem(CUSTOMER_TOKEN_KEY, token);
}

export function dropToken(page: KeyValue): void {
  page.removeItem(CUSTOMER_TOKEN_KEY);
}
