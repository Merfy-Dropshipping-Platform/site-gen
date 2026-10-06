import { hashOf } from './canonical';
import type { BuildInputs } from './inputs';

// Карта «сущность → хэш» (design.md блока 4, В4-2 Б): сайт и каждая сущность снимка. По ней ключ видит любую правку
// данных, а сравнение с прошлой сборкой — какие сущности поменялись. Хэш — по сущности целиком, с датой правки: из неё
// манифест берёт lastmod страницы.

type Row = [key: string, hash: string];

export const entityKey = (type: string, id: string): string => `${type}:${id}`;

// Ключи карты разные (дубли отсекает parseBuildInputs), поэтому равенства в сравнении нет.
const byKey = ([left]: Row, [right]: Row): number => (left < right ? -1 : 1);

// Порядок записей — по ключу: порядку ответа сервисов не верим (факт 11).
export function entityHashes(inputs: BuildInputs): Record<string, string> {
  const site: Row = [entityKey('site', inputs.site.id), hashOf(inputs.site)];
  const rows = inputs.data.entities.map((entity): Row => [entityKey(entity.type, entity.id), hashOf(entity)]);
  return Object.fromEntries([site, ...rows].sort(byKey));
}
