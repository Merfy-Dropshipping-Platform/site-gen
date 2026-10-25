import type { Behavior } from './types';

// Блок 11 «Секций и SDK», часть 11б-2 (Б11б-8 напишет тело). Имя файла catalog-list.ts: catalog.ts — каталог поведений.
export const catalog: Behavior<'catalog'> = { name: 'catalog', attach: () => ({}) };
