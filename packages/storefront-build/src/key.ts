import { hashOf } from './canonical';
import { entityHashes } from './entities';
import type { BuildInputs } from './inputs';

// Версия формулы ключа. Поменяли состав или форму того, что хэшируется, — поднять: иначе ключи разных формул могут
// совпасть. 2 — блок 7: ядро с отпечатком и подсказками, код секций. 4 — блок 12: версия библиотеки шрифтов. 5 — блок 1
// «Секций и SDK»: экземпляры секций и модули рендера.
export const KEY_VERSION = 5;

// Ключ сборки (design.md блока 4, раздел 1): хэш всех входов. Одинаковые входы — одинаковый ключ и одинаковые файлы;
// ключ тот же — сборка не нужна. Данные и сайт входят картой «сущность → хэш» (В4-2 Б). Справки — коммит платформы —
// в ключ не входят.
export const buildKey = (inputs: BuildInputs): string =>
  hashOf({
    v: KEY_VERSION,
    platform: inputs.platform,
    theme: inputs.theme,
    shell: inputs.shell,
    fonts: inputs.fonts,
    code: inputs.code,
    revision: inputs.revision,
    env: inputs.env,
    year: inputs.year,
    entities: entityHashes(inputs),
  });

// Ключ данных (блок 10, задача 11) — его сравнивает сверка сборщика раз в час. В нём только то, что доходит до витрины
// событием или сверкой; то, что разносит выпуск волнами, в него не входит. Код делится по автору секции — префиксу
// имени (блок 1 «Секций и SDK»: секций платформы и тем нет, пп. 1, 2):
//   «shop:» — свой код магазина: целиком;
//   остальные — расширения: только имя и вид секции. Включили или выключили расширение — расхождение (событий об этом
//     нет, до витрины его доносит сверка); новая версия расширения — нет, её разносит выпуск расширения.
// Код платформы — renderHash и ядро @merfy/shell — в ключ не входит: его разносит выпуск платформы. Экземпляры секций
// на страницах (code.pages) и глобальные скрипты — целиком: их меняет мерчант. Р5: DATA_KEY_VERSION остаётся 1.
// Поменяли состав — поднять DATA_KEY_VERSION.
export const DATA_KEY_VERSION = 1;
type CodeSectionInput = BuildInputs['code']['sections'][number];

const isOwn = (name: string): boolean => name.slice(0, name.indexOf(':')) === 'shop';

const dataSection = (section: CodeSectionInput) =>
  isOwn(section.name) ? section : { name: section.name, kind: section.kind };

const dataCode = ({ code }: BuildInputs) => ({
  sections: code.sections.map(dataSection),
  pages: code.pages,
  globals: code.globals,
});

export const dataKey = (inputs: BuildInputs): string =>
  hashOf({
    v: DATA_KEY_VERSION,
    theme: inputs.theme,
    code: dataCode(inputs),
    revision: inputs.revision,
    env: inputs.env,
    year: inputs.year,
    entities: entityHashes(inputs),
  });
