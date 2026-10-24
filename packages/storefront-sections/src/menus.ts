import type { MenuTree, MenuTreeItem } from '@merfy/storefront-build';
import { z } from 'zod';

// Меню магазина (блок 1 «Секций и SDK», часть 4, design.md 3.21, Р1-4-3). Ключ menus ревизии —
// [{ id, title, items: [{ label, url, items? }] }], до трёх уровней; главное меню — main, в его конец sites дописывает
// новую страницу. Настройка вида menu хранит id меню; в шаблон приходит дерево меню: у пункта items — всегда список.
// Меню с таким id нет — пустое дерево. Адрес не со своего сайта и не http(s), mailto или tel — '#'.
export const MAIN_MENU = 'main';
export const MENU_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
export const MENU_ID_MAX = 40;
const LABEL_MAX = 200;
const URL_MAX = 2048;
const ITEMS_MAX = 50;
const MENUS_MAX = 20;
const SAFE_URL = /^(?:\/(?!\/)|https?:\/\/|mailto:|tel:)/i;

const itemShape = { label: z.string().max(LABEL_MAX), url: z.string().max(URL_MAX) };
const thirdLevelSchema = z.strictObject(itemShape);
const secondLevelSchema = z.strictObject({ ...itemShape, items: z.array(thirdLevelSchema).max(ITEMS_MAX).optional() });
const firstLevelSchema = z.strictObject({ ...itemShape, items: z.array(secondLevelSchema).max(ITEMS_MAX).optional() });

export const revisionMenuSchema = z.strictObject({
  id: z.string().max(MENU_ID_MAX).regex(MENU_ID),
  title: z.string().max(LABEL_MAX),
  items: z.array(firstLevelSchema).max(ITEMS_MAX),
});
export const revisionMenusSchema = z.array(revisionMenuSchema).max(MENUS_MAX);
export type RevisionMenu = z.infer<typeof revisionMenuSchema>;

export const EMPTY_MENU: MenuTree = { title: '', items: [] };

interface StoredItem {
  label: string;
  url: string;
  items?: readonly StoredItem[];
}

const safeUrl = (url: string): string => (SAFE_URL.test(url.trim()) ? url.trim() : '#');

const treeItem = (item: StoredItem): MenuTreeItem => ({
  label: item.label,
  url: safeUrl(item.url),
  items: (item.items ?? []).map(treeItem),
});

export function menuTreeOf(menus: readonly RevisionMenu[], id: string): MenuTree {
  const menu = menus.find((candidate) => candidate.id === id);
  return menu === undefined ? EMPTY_MENU : { title: menu.title, items: menu.items.map(treeItem) };
}

// Деревья меню для настроек вида menu секции: id настройки → дерево меню по её значению.
export function sectionMenus(
  fields: readonly { id: string; setting: { kind: string } }[],
  values: Readonly<Record<string, unknown>>,
  menus: readonly RevisionMenu[],
): Record<string, MenuTree> {
  const trees = fields
    .filter((field) => field.setting.kind === 'menu')
    .map((field): [string, MenuTree] => {
      const value = values[field.id];
      return [field.id, menuTreeOf(menus, typeof value === 'string' ? value : '')];
    });
  return Object.fromEntries(trees);
}
