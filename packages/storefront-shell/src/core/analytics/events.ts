import type { Traffic } from './traffic.ts';

// События магазина в браузере (design.md блока 11, С11-1 А): визит, просмотр страницы, «в корзину», «из корзины». Это
// внутренний вид события: каждый адресат переводит его в свой формат (collector.ts — наш сборщик; при С11-3 Б —
// переводчик для Метрики мерчанта). Цены и названия товара нет: строка корзины ядра — только товар и количество (шов до
// договора SDK, блок 7). Количество сборщик пока не хранит — оно для переводчиков (решил сам 3).
export type EventType = 'session_start' | 'page_view' | 'add_to_cart' | 'remove_from_cart';

export interface ProductLine {
  id: string;
  quantity: number;
}

export interface PageContext {
  path: string;
  title: string;
  referrer: string;
  utm: { source: string; medium: string; campaign: string };
}

export interface ShopEvent {
  type: EventType;
  at: string;
  sessionId: string;
  visitorId: string;
  page: PageContext;
  traffic: Traffic;
  product: ProductLine | null;
}

// Страница события: путь — из конфига (решил сам 6), метки рекламы — из адреса, как у нынешнего трекера.
export function pageContext(doc: Pick<Document, 'title' | 'referrer'>, href: string, path: string): PageContext {
  const params = new URL(href).searchParams;
  const utm = (name: string): string => params.get(`utm_${name}`) ?? '';
  return {
    path,
    title: doc.title,
    referrer: doc.referrer,
    utm: { source: utm('source'), medium: utm('medium'), campaign: utm('campaign') },
  };
}
