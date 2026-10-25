import { PREVIEW_CART_MESSAGE, PREVIEW_CART_PARAM } from './preview-protocol';
import type { KeyValue } from './storage';

// Номер корзины в превью (блок 10, «Решил сам» п. 24; Р10а-9): номер из адреса рамки ?merfy-cart=<uuid> — в память
// страницы; новый номер под ключом key — сообщение родителю { type: PREVIEW_CART_MESSAGE, id }. Не uuid — пропускается.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const cartIdOfSearch = (search: string): string | null => {
  const value = new URLSearchParams(search).get(PREVIEW_CART_PARAM);
  return value !== null && UUID_RE.test(value) ? value : null;
};

// Тот же договор, что у base: отличается только setItem ключа key — он ещё и сообщает номер конструктору.
export function previewCartStorage(
  base: KeyValue,
  win: { readonly location: { readonly search: string }; readonly parent: Pick<Window, 'postMessage'> | Window },
  key: string,
): KeyValue {
  const initial = cartIdOfSearch(win.location.search);
  if (initial !== null) base.setItem(key, initial);
  return {
    getItem: (k: string): string | null => base.getItem(k),
    setItem(k: string, value: string): void {
      base.setItem(k, value);
      if (k === key && win.parent !== win) win.parent.postMessage({ type: PREVIEW_CART_MESSAGE, id: value }, '*');
    },
    removeItem: (k: string): void => base.removeItem(k),
    key: (index: number): string | null => base.key(index),
    get length(): number {
      return base.length;
    },
  };
}
