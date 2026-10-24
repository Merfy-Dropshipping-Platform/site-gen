import { previewCode, type BuildInputs, type CodeAssets, type ShellBuild } from '@merfy/storefront-build';
import type { CurrentSection } from '@merfy/storefront-sections';

// Код секций в ответах превью (блок 5 «Секций и SDK», часть 5г; design.md блока 5, раздел 3.11; Р5г-12, Р5г-13).
// GET /preview — бандл превью и скрипт превью перед </body> (previewCode пакета сборки); POST /preview/section — код
// секции рядом с HTML; GET /sections — scriptHash секции с кодом, по нему конструктор видит новую версию. Хеши — 64
// знака hex, без «sha256:». Предупреждения бандла превью (пропущенная секция) в журнал не идут: превью — не сборка.
export type PreviewShell = ShellBuild;

// Входы превью: входы сборки, модули рендера и байты кода снимка (assets: бандл превью; нет — превью без кода).
export interface PreviewInputs {
  inputs: BuildInputs;
  renders: ReadonlyMap<string, string>;
  assets?: CodeAssets;
}

export interface PreviewScriptAnswer {
  hash: string;
  code: string;
  uses: readonly string[];
}

const HASH_PREFIX = 'sha256:';
const HEX64 = /^[0-9a-f]{64}$/;

// Хеш кода секции без «sha256:»; кода нет или хеш не той формы — null.
function scriptHex(current: CurrentSection): string | null {
  const hash = current.script?.hash ?? '';
  const hex = hash.startsWith(HASH_PREFIX) ? hash.slice(HASH_PREFIX.length) : '';
  return HEX64.test(hex) ? hex : null;
}

// Код секции для скрипта превью: модуль без импортов, его хеш и модули SDK для ctx — script_meta.uses; у строки до
// части 5в — части ядра. Секция без кода — null.
export function previewScriptOf(current: CurrentSection, shell: PreviewShell | null): PreviewScriptAnswer | null {
  const hex = scriptHex(current);
  if (hex === null || current.script === undefined) return null;
  return { hash: hex, code: current.script.code, uses: current.scriptMeta?.uses ?? shell?.parts ?? [] };
}

// scriptHash строки списка секций — только у секции с кодом.
export function scriptHashOf(current: CurrentSection): { scriptHash?: string } {
  const hex = scriptHex(current);
  return hex === null ? {} : { scriptHash: hex };
}

// Экземпляр превью одного блока — как секция страницы (Р5г-13): тег входных данных у секции с кодом, CSS классов,
// которые ставит её скрипт.
export function scriptPlacedOf(current: CurrentSection): { script?: boolean; classes?: readonly string[] } {
  if (current.script === undefined) return {};
  const classes = current.scriptMeta?.classes ?? [];
  return classes.length === 0 ? { script: true } : { script: true, classes };
}

// Теги кода страницы превью: '' — снимка кода нет или у сборки ядра нет dist/preview.js.
export async function previewTags(inputs: BuildInputs, assets: CodeAssets | undefined): Promise<string> {
  if (assets === undefined) return '';
  return (await previewCode(inputs, assets)).tags;
}
