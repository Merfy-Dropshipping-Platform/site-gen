import { ShellError } from '../errors';
import { deepFreeze } from './freeze';
import type { BlockValue, Json, SettingValue } from './types';

// Тег входных данных экземпляра (design.md блока 5, раздел 3.5; 11в А) — договор со сборкой магазина: часть 5б пишет
// тег, ядро читает. Последний дочерний элемент <merfy-section>, только у секции со скриптом:
// <script type="application/json" data-merfy-input>{"settings":{…},"blocks":[{"id","type","settings"}],"data":{}}</script>
// Сборка пишет JSON.stringify(input) через escapeScriptJson (@merfy/storefront-config): «<», U+2028 и U+2029 внутри
// тега — escape-последовательностями JSON, поэтому </script> в настройке тег не закрывает.
// Больше SECTION_INPUT_MAX_BYTES (UTF-8) сборка тег не пишет и пропускает секцию с кодом input-too-large.
export const SECTION_INPUT_ATTRIBUTE = 'data-merfy-input';
export const SECTION_INPUT_MAX_BYTES = 32 * 1024;
export const INPUT_PARSE_FAILED = 'не удалось разобрать входные данные';
const INPUT_SELECTOR = `:scope > script[type="application/json"][${SECTION_INPUT_ATTRIBUTE}]`;

export interface SectionInput {
  readonly settings: Readonly<Record<string, SettingValue>>;
  readonly blocks: readonly BlockValue[];
  readonly data: Readonly<Record<string, Json>>;
}

// Тега нет — у секции нет скрипта, есть только разметка SDK (data-action с точкой, data-behavior, data-animate).
export const EMPTY_INPUT: SectionInput = deepFreeze({ settings: {}, blocks: [], data: {} });

const isRecord = (value: unknown): value is Record<string, Json> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isBlock = (value: unknown): value is BlockValue =>
  isRecord(value) && typeof value.id === 'string' && typeof value.type === 'string' && isRecord(value.settings);

function isSectionInput(value: unknown): value is SectionInput {
  if (!isRecord(value)) return false;
  const blocks: unknown = value.blocks;
  return isRecord(value.settings) && Array.isArray(blocks) && blocks.every(isBlock) && isRecord(value.data);
}

function parseJson(text: string): unknown {
  try {
    const value: unknown = JSON.parse(text);
    return value;
  } catch (error) {
    throw new ShellError('input-invalid', INPUT_PARSE_FAILED, { cause: error });
  }
}

// Битый тег — ShellError input-invalid с текстом INPUT_PARSE_FAILED: ядро не запускает экземпляр и отправляет событие
// сбоя со стадией mount (11в А: «секция остаётся HTML без поведения»).
export function readSectionInput(section: Element): SectionInput {
  const tag = section.querySelector(INPUT_SELECTOR);
  if (tag === null) return EMPTY_INPUT;
  const value = parseJson(tag.textContent ?? '');
  if (!isSectionInput(value)) throw new ShellError('input-invalid', INPUT_PARSE_FAILED);
  return deepFreeze(value);
}
