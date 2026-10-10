import { ShellError } from '../src/errors';
import { PART_NAMES, type PartName } from '../src/parts/types';

// Состав ядра — один список (design.md блока 7, С7-3 Б). Владелец 10.10: «тут надо гибко я в любой момент могу поменять
// состав начальных скриптов и это должно работать удобно и гидко». Список — core-parts.json пакета: правка списка и
// версии пакета меняет ядро, секции не меняются. Незнакомая часть и повтор — ошибка сборки, а не тихий пропуск.
const FILE = 'core-parts.json';
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
