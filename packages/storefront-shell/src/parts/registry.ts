import { ShellError } from '../errors';
import { PART_NAMES, type PartName, type Parts } from './types';

// Части ядра одним списком (С7-3 Б). Собранное ядро регистрирует загрузчик каждой части: часть из core-parts.json уже в
// файле ядра, остальные — отдельные файлы, import() при первом обращении. Секция берёт часть одинаково —
// await part('cart'), поэтому состав ядра меняется без правки секций.
export type PartLoaders = { [N in PartName]: () => Promise<{ part: Parts[N] }> };

let loaders: PartLoaders | null = null;

export function registerParts(next: PartLoaders): void {
  loaders = next;
}

const isPartName = (name: string): name is PartName => PART_NAMES.some((known) => known === name);

export async function part<N extends PartName>(name: N): Promise<Parts[N]> {
  if (loaders === null || !isPartName(name)) throw new ShellError('part-unknown', `части ${name} нет в ядре`);
  const module = await loaders[name]();
  return module.part;
}
