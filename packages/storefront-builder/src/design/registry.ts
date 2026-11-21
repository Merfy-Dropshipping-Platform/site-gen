import { dembrandt } from './tools/dembrandt';
import { designlang } from './tools/designlang';
import { dom } from './tools/dom';
import { own } from './tools/own';
import type { OutlineTool, StyleTool } from './tools/tool';

// Какие инструменты дизайна есть и какие включены. Выбор — переменными DESIGN_STYLE и DESIGN_OUTLINE, порядок —
// запасной путь (и дозаполнение недостающих полей стиля). Новый инструмент: файл переходника в `tools/`, строка здесь,
// пакет с точной версией в package.json → прогон стенда `design-lab` → лучше — меняем переменную в Coolify.

export const STYLE_TOOLS: Record<string, StyleTool> = { dembrandt, designlang, own };
export const OUTLINE_TOOLS: Record<string, OutlineTool> = { designlang, dom };

export const DEFAULT_STYLE = 'dembrandt,own';
export const DEFAULT_OUTLINE = 'designlang,dom';

// Имена из настройки по порядку; неизвестное имя — ошибка настройки при старте, а не тихий пропуск.
export function pick<T>(setting: string, raw: string | undefined, fallback: string, table: Record<string, T>): T[] {
  const names = [
    ...new Set(
      (raw ?? fallback)
        .split(',')
        .map((name) => name.trim())
        .filter(Boolean),
    ),
  ];
  const unknown = names.filter((name) => table[name] === undefined);
  if (unknown.length > 0 || names.length === 0) {
    throw new Error(
      `${setting}: нет инструментов ${unknown.join(', ') || '(пусто)'} (есть: ${Object.keys(table).join(', ')})`,
    );
  }
  return names.flatMap((name) => table[name] ?? []);
}

export const styleChain = (env: NodeJS.ProcessEnv): StyleTool[] =>
  pick('DESIGN_STYLE', env.DESIGN_STYLE, DEFAULT_STYLE, STYLE_TOOLS);
export const outlineChain = (env: NodeJS.ProcessEnv): OutlineTool[] =>
  pick('DESIGN_OUTLINE', env.DESIGN_OUTLINE, DEFAULT_OUTLINE, OUTLINE_TOOLS);
