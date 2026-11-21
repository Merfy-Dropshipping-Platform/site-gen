import { readFileSync } from 'node:fs';
import type { Captured } from '../design-capture';
import type { DomBlock } from '../design-dom';
import type { StylePart } from '../design-style';
import type { Band, PageOutline } from '../design-types';

// Общий вид сменных переходников «Дизайна по ссылке» (раздел 2 контракта). Переходник — две части: `raw` снимает
// сырой ответ инструмента по открытой странице (его хранит `design_looks.raw` и показывает стенд), чистая функция
// `style`/`outline` переводит его в наш формат (её и проверяют тесты на записанных ответах). Новый инструмент — файл
// переходника, строка в `registry.ts` и пакет с точной версией в package.json; выбор — DESIGN_STYLE и DESIGN_OUTLINE.

export interface ToolRun {
  captured: Captured;
  // Сколько мс осталось инструменту.
  budgetMs: number;
}

// Что из захвата нужно переводу: шрифты с Google Fonts (источник шрифта) и контур DOM.
export interface ToolFacts {
  google: ReadonlySet<string>;
  dom: DomBlock[];
  bands: Pick<Band, 'top'>[];
}

export interface StyleTool {
  name: string;
  version: string;
  raw: (run: ToolRun) => Promise<unknown>;
  style: (raw: unknown, facts: ToolFacts) => StylePart;
}

export interface OutlineTool {
  name: string;
  version: string;
  raw: (run: ToolRun) => Promise<unknown>;
  outline: (raw: unknown, facts: ToolFacts) => PageOutline;
}

export class ToolFailed extends Error {
  constructor(message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = 'ToolFailed';
  }
}

let pinnedVersions: Record<string, unknown> | undefined;

// Версия пакета, закреплённая в package.json проверяющего процесса: её и пишем в `tool_version`.
export function pinned(name: string): string {
  pinnedVersions ??= dependenciesOf(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8'));
  const version = pinnedVersions[name];
  return typeof version === 'string' ? version : 'unknown';
}

export function dependenciesOf(json: string): Record<string, unknown> {
  const parsed: unknown = JSON.parse(json);
  const deps = typeof parsed === 'object' && parsed !== null && 'dependencies' in parsed ? parsed.dependencies : {};
  return typeof deps === 'object' && deps !== null ? Object.fromEntries(Object.entries(deps)) : {};
}
