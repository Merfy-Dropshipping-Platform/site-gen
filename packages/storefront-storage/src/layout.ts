import { StorefrontStorageError } from './errors';

// Где что лежит в бакете (design.md блока 5, раздел 4, «Хранение и уборка»): всё новое — под префиксом storefront/
// бакета merfy-sites, рядом с нынешним sites/. Файлы — по отпечатку, один раз на платформу; остальное — по магазину.
//   blobs/<2 знака>/<64 знака>           — файл сборки по отпечатку sha256 содержимого;
//   manifests/<магазин>/<сборка>.json      — манифест сборки (блок 4) как есть;
//   routes/<магазин>/<сборка>.json         — таблица раздачи сборки: её читает раздача (njs);
//   drawn/<магазин>/<сборка>.json          — список дорисовок живой сборки (Св-1 В);
//   entities/<магазин>.json                — список адресов сущностей магазина (В5-7 Б);
//   pointers/<метка хоста>.json            — указатель: какую сборку отдавать (В5-2 Б).

export const STOREFRONT_PREFIX = 'storefront/';

const HASH = /^sha256:([0-9a-f]{64})$/;
// Метка хоста — как у роутеров Traefik и прокси нынешних магазинов: строчные латинские буквы, цифры, дефис.
const LABEL = /^[a-z0-9-]+$/;

// Отпечаток манифеста «sha256:<hex>» → 64 знака hex: так файл называется в хранилище и в таблице раздачи.
export function hexOf(hash: string): string {
  const match = HASH.exec(hash);
  if (match === null)
    throw new StorefrontStorageError('object-invalid', 'ожидался хэш sha256:<64 знака hex>', { path: hash });
  return match[1];
}

export function blobKey(hash: string): string {
  const hex = hexOf(hash);
  return `${STOREFRONT_PREFIX}blobs/${hex.slice(0, 2)}/${hex}`;
}

export const manifestKey = (shop: string, build: number): string =>
  `${STOREFRONT_PREFIX}manifests/${shop}/${build}.json`;
export const routesKey = (shop: string, build: number): string => `${STOREFRONT_PREFIX}routes/${shop}/${build}.json`;
export const drawnKey = (shop: string, build: number): string => `${STOREFRONT_PREFIX}drawn/${shop}/${build}.json`;
export const entitiesKey = (shop: string): string => `${STOREFRONT_PREFIX}entities/${shop}.json`;

export function pointerKey(label: string): string {
  if (!LABEL.test(label))
    throw new StorefrontStorageError('object-invalid', 'метка хоста — a-z, 0-9 и дефис', { path: label });
  return `${STOREFRONT_PREFIX}pointers/${label}.json`;
}
