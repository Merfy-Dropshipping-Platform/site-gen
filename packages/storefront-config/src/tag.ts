import type { StorefrontConfig } from './schema';

// Тег конфига в <head> (design.md блока 3, 5.4): JSON внутри <script type="application/json">. Тег не исполняется.
// Модуль без zod: id тега берёт читатель в браузере.
export const CONFIG_TAG_ID = 'merfy-config';

// Символы берём кодом, а не литералом в исходнике: так их не испортит ни редактор, ни копирование.
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

// Те же замены, что у inlineScriptJson в site-gen (src/common/inline-script-json.ts). Без «<» внутри тега HTML не
// увидит ни </script>, ни <!--; U+2028 и U+2029 старые движки считают концом строки. JSON.parse из этих
// последовательностей вернёт те же символы, поэтому разбор даёт тот же объект.
const SCRIPT_JSON_ESCAPES: readonly (readonly [string, string])[] = [
  ['<', '\\u003c'],
  [LINE_SEPARATOR, '\\u2028'],
  [PARAGRAPH_SEPARATOR, '\\u2029'],
];

export function escapeScriptJson(json: string): string {
  return SCRIPT_JSON_ESCAPES.reduce((text, [from, to]) => text.replaceAll(from, to), json);
}

export function configTag(config: StorefrontConfig): string {
  const json = escapeScriptJson(JSON.stringify(config));
  return `<script type="application/json" id="${CONFIG_TAG_ID}">${json}</script>`;
}
