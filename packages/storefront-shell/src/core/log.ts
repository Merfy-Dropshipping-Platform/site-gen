import type { Mode } from './types';

// ctx.log (design.md блока 5, раздел 3.2): отладка кода секции. В превью — console.info с именем секции и id экземпляра,
// на витрине вывода нет — консоль опубликованного сайта остаётся пустой. Единственный файл ядра с console.info.
export function sectionLog(mode: Mode, name: string, id: string, values: readonly unknown[]): void {
  if (mode === 'preview') console.info(`[${name}#${id}]`, ...values);
}
