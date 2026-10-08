import { checkManifest, type StorefrontManifest } from '@merfy/storefront-build';
import { manifestKey, readObject, readPointer, type ObjectStore } from '@merfy/storefront-storage';

// Манифест живой сборки магазина (design.md блока 6, «нет сборки, если ключ совпал с живой» и сверка Св-3 А): указатель
// блока 5 → манифест его сборки. Указателя нет — живой сборки нет, null.
export async function liveManifest(store: ObjectStore, label: string): Promise<StorefrontManifest | null> {
  const pointer = await readPointer(store, label);
  if (pointer === null) return null;
  const manifest = await readObject(store, manifestKey(pointer.shop, pointer.build), (value) => checkManifest(value));
  return manifest?.value ?? null;
}

export async function liveKey(store: ObjectStore, label: string): Promise<string | null> {
  return (await liveManifest(store, label))?.key ?? null;
}
