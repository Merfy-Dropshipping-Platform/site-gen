// Глубина вложенности шаблона — до разбора и компиляции (блок 2 «Секций и SDK», «Решил сам» п. 6). На очень глубоком
// шаблоне компилятор падает: WASI — RangeError около 510 вложенных фигурных скобок и 970 тегов (arm64), нативный —
// SIGSEGV около 3300 тегов. Предел — вдвое ниже самого низкого порога. Счёт — по тексту, грубо: открывающий тег, «(», «[»
// и «{» — уровень вверх; закрывающий тег, «/>» после тега с уровнем, «)», «]» и «}» — вниз. Пустые элементы (<br>,
// <img>…) уровня не дают. Скобки в строках считаются как скобки кода. Если счёт ошибся, компилятор отказывает сам:
// RangeError WASI — отказ template-compile.
export const MAX_TEMPLATE_DEPTH = 256;

const VOID_TAGS: ReadonlySet<string> = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);
const TOKEN = /<\/|\/>|<([A-Za-z][\w.:-]*)|[([{]|[)\]}]/g;
const OPENING = new Set(['(', '[', '{']);

interface Step {
  delta: number;
  // Последний открывающий тег дал уровень: его «/>» уровень снимает.
  counted: boolean;
}

function stepOf(token: string, tag: string | undefined, counted: boolean): Step {
  if (tag !== undefined)
    return VOID_TAGS.has(tag.toLowerCase()) ? { delta: 0, counted: false } : { delta: 1, counted: true };
  if (token === '/>') return { delta: counted ? -1 : 0, counted: false };
  return { delta: OPENING.has(token) ? 1 : -1, counted };
}

export function templateDepth(text: string): number {
  let depth = 0;
  let deepest = 0;
  let counted = false;
  for (const match of text.matchAll(TOKEN)) {
    const step = stepOf(match[0], match[1], counted);
    depth = Math.max(0, depth + step.delta);
    deepest = Math.max(deepest, depth);
    counted = step.counted;
  }
  return deepest;
}
