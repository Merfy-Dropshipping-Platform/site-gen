import type { ModuleName } from '../src/core/types';
import { ShellError } from '../src/errors';

// Состав ядра секций — один список (design.md блока 7, С7-3 Б; блок 5 «Секций и SDK», раздел 3.10). Владелец 10.10:
// «тут надо гибко я в любой момент могу поменять состав начальных скриптов и это должно работать удобно и гидко».
// Список — core-parts.json пакета: части из него — в бандле каждой страницы магазина, их получает каждая секция (до
// части 5в). Незнакомая часть и повтор — ошибка сборки, а не тихий пропуск.
const FILE = 'core-parts.json';
export const PART_NAMES = ['auth', 'cart', 'favorites'] as const satisfies readonly ModuleName[];
type PartName = (typeof PART_NAMES)[number];
const isPartName = (value: unknown): value is PartName => PART_NAMES.some((name) => name === value);

export function parseCoreParts(value: unknown): PartName[] {
  const core: unknown = typeof value === 'object' && value !== null ? Reflect.get(value, 'core') : undefined;
  if (!Array.isArray(core))
    throw new ShellError('part-unknown', 'нужно { "core": ["auth", "cart", ...] }', { path: FILE });
  const bad = core.findIndex((name) => !isPartName(name));
  if (bad !== -1)
    throw new ShellError('part-unknown', `нет такой части; есть ${PART_NAMES.join(', ')}`, {
      path: `${FILE}.core.${bad}`,
    });
  const names = core.filter(isPartName);
  if (new Set(names).size !== names.length)
    throw new ShellError('part-unknown', 'часть указана дважды', { path: FILE });
  return names;
}
