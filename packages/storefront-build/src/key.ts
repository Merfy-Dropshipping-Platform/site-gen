import { hashOf } from './canonical';
import { entityHashes } from './entities';
import type { BuildInputs } from './inputs';

// Версия формулы ключа. Поменяли состав или форму того, что хэшируется, — поднять: иначе ключи разных формул могут
// совпасть. 2 — блок 7: ядро с отпечатком и подсказками, код секций.
export const KEY_VERSION = 3;

// Ключ сборки (design.md блока 4, раздел 1): хэш всех входов. Одинаковые входы — одинаковый ключ и одинаковые файлы;
// ключ тот же — сборка не нужна. Данные и сайт входят картой «сущность → хэш» (В4-2 Б). Справки — коммит платформы —
// в ключ не входят.
export const buildKey = (inputs: BuildInputs): string =>
  hashOf({
    v: KEY_VERSION,
    platform: inputs.platform,
    theme: inputs.theme,
    shell: inputs.shell,
    code: inputs.code,
    revision: inputs.revision,
    env: inputs.env,
    year: inputs.year,
    entities: entityHashes(inputs),
  });

// Ключ данных (блок 10, задача 11) — его сравнивает сверка сборщика раз в час. В нём только то, что доходит до витрины
// событием или сверкой; то, что разносит выпуск волнами, в него не входит. Код делится по автору секции — приставке
// имени (блок 7):
//   «platform:» — платформа: секций и глобальных скриптов нет, как и renderHash и ядра @merfy/shell (выпуск платформы);
//   id темы (inputs.theme.id) и «shop:» — тема и свой код магазина: целиком; версия темы закреплена у магазина, смена
//     закрепления — расхождение;
//   остальные — расширения: только имя и вид секции. Включили или выключили расширение — расхождение (событий об этом
//     нет, до витрины его доносит сверка); новая версия расширения — нет, её разносит выпуск расширения.
// Поменяли состав — поднять DATA_KEY_VERSION.
export const DATA_KEY_VERSION = 1;
type CodeSectionInput = BuildInputs['code']['sections'][number];
type SectionAuthor = 'platform' | 'own' | 'extension';

function authorOf(name: string, themeId: string): SectionAuthor {
  const prefix = name.slice(0, name.indexOf(':'));
  if (prefix === 'platform') return 'platform';
  return prefix === themeId || prefix === 'shop' ? 'own' : 'extension';
}

const dataSection = (section: CodeSectionInput, themeId: string) =>
  authorOf(section.name, themeId) === 'extension' ? { name: section.name, kind: section.kind } : section;

const dataCode = ({ code, theme }: BuildInputs) => ({
  sections: code.sections
    .filter((section) => authorOf(section.name, theme.id) !== 'platform')
    .map((section) => dataSection(section, theme.id)),
  pages: code.pages,
  globals: code.globals.filter((name) => authorOf(name, theme.id) !== 'platform'),
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
