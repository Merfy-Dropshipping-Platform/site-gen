import { hashOf } from './canonical';
import { entityHashes } from './entities';
import type { BuildInputs } from './inputs';

// Версия формулы ключа. Поменяли состав или форму того, что хэшируется, — поднять: иначе ключи разных формул могут
// совпасть.
export const KEY_VERSION = 1;

// Ключ сборки (design.md блока 4, раздел 1): хэш всех входов. Одинаковые входы — одинаковый ключ и одинаковые файлы;
// ключ тот же — сборка не нужна. Данные и сайт входят картой «сущность → хэш» (В4-2 Б). Справки — коммит платформы —
// в ключ не входят.
export const buildKey = (inputs: BuildInputs): string =>
  hashOf({
    v: KEY_VERSION,
    platform: inputs.platform,
    theme: inputs.theme,
    shell: inputs.shell,
    revision: inputs.revision,
    env: inputs.env,
    year: inputs.year,
    entities: entityHashes(inputs),
  });
