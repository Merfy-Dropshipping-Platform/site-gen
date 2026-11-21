import type { Captured, Session } from './design-capture';
import { EMPTY_CONTENT, parseContent } from './design-content';
import { pageScript } from './design-scripts';
import { finishStyle, isEmptyPart, mergeParts, missingPaths, type StylePart } from './design-style';
import { DesignError, type DesignSnapshot, type OwnContent, type PageOutline } from './design-types';
import { TAB_ORDER, ToolFailed, type OutlineTool, type StyleTool, type ToolFacts } from './tools/tool';

// Одно снятие дизайна: захват → содержимое своего сайта (owned) по нетронутой странице → первый круг инструментов по
// одной вкладке, по очереди (`TabUse.order`: свои скрипты → чужие, что читают → чужие, что меняют страницу), каждый не
// дольше своего `limitMs` → цепочки (остальных инструментов зовут по требованию) → ответ контракта. В цепочке стиля инструменты идут
// по порядку DESIGN_STYLE: упал, не уложился или пусто — следующий; ответил, но не всё — следующий дозаполняет
// недостающее (`missingPaths`), у поля побеждает самое уверенное значение. В цепочке контура — первый, кто ответил.
// Свой скрипт стиля готов за миллисекунды до чужих, поэтому запасной путь есть, даже когда чужой инструмент завис.
// Сырой ответ одного инструмента снимается один раз (designlang есть в обеих цепочках). Имя инструмента и сырые ответы
// идут только в ответ для `design_looks` — модели их не отдают.

export const RAW_LIMIT_BYTES = 512 * 1024;
// Запас до срока задания: ответ ещё нужно собрать и отправить.
const MARGIN_MS = 2_000;
const CONTENT_MS = 15_000;

export interface RunDeps {
  capture: (url: string) => Promise<Session>;
  style: StyleTool[];
  outline: OutlineTool[];
  now: () => number;
}

export interface RunInput {
  url: string;
  owned: boolean;
  // Время (мс с 1970), к которому ответ должен быть готов.
  deadline: number;
}

export type RawTool = Pick<StyleTool, 'name' | 'raw' | 'order' | 'limitMs'>;

// Сырые ответы задания по имени инструмента; ошибки — отдельно, тоже по имени.
export interface Raws {
  values: Record<string, unknown>;
  errors: Record<string, string>;
  ms: Record<string, number>;
}

const message = (error: unknown): string => String(error instanceof Error ? error.message : error).slice(0, 300);

// Инструменты без повторов (designlang — в обеих цепочках) в порядке очереди на вкладке; при равной очереди — как в
// настройке.
export function tabQueue<T extends RawTool>(tools: T[]): T[] {
  const unique = [...new Map(tools.map((tool) => [tool.name, tool])).values()];
  return unique
    .map((tool, index) => ({ tool, index }))
    .sort((a, b) => a.tool.order - b.tool.order || a.index - b.index)
    .map(({ tool }) => tool);
}

// Первый круг: свои скрипты (миллисекунды, запасной путь наготове) и первые инструменты обеих цепочек. Остальных
// цепочка зовёт, только если первый упал или ответил не всё.
export const firstRound = (style: RawTool[], outline: RawTool[]): RawTool[] =>
  tabQueue(
    [...style, ...outline].filter((tool) => tool.order === TAB_ORDER.own || tool === style[0] || tool === outline[0]),
  );

// Срок инструмента: свой предел, но не дальше срока задания.
export const toolBudget = (tool: Pick<RawTool, 'limitMs'>, left: number): number => Math.min(tool.limitMs, left);

// Сырые ответы инструментов по одной вкладке: каждый — один раз, строго по одному (вызовы идут друг за другом).
// Срок задания вышел — инструмент не запускается, а отмечается ошибкой.
export class TabRuns {
  readonly raws: Raws = { values: {}, errors: {}, ms: {} };

  constructor(
    private readonly captured: Captured,
    private readonly budget: () => number,
    private readonly now: () => number,
  ) {}

  async all(tools: RawTool[]): Promise<void> {
    for (const tool of tabQueue(tools)) await this.ensure(tool);
  }

  // Ответ инструмента или null, если он упал или не уложился.
  async get(tool: RawTool): Promise<{ value: unknown } | null> {
    await this.ensure(tool);
    return tool.name in this.raws.values ? { value: this.raws.values[tool.name] } : null;
  }

  private async ensure(tool: RawTool): Promise<void> {
    if (tool.name in this.raws.ms) return;
    const budgetMs = toolBudget(tool, this.budget());
    const startedAt = this.now();
    const run =
      budgetMs > 0
        ? tool.raw({ captured: this.captured, budgetMs })
        : Promise.reject(new ToolFailed('срок задания вышел'));
    await run.then(
      (value) => void (this.raws.values[tool.name] = value),
      (error: unknown) => void (this.raws.errors[tool.name] = message(error)),
    );
    this.raws.ms[tool.name] = this.now() - startedAt;
  }
}

// Все инструменты по очереди (стенд: сравнить каждый).
export async function runTools(
  tools: RawTool[],
  captured: Captured,
  budget: () => number,
  now: () => number,
): Promise<Raws> {
  const runs = new TabRuns(captured, budget, now);
  await runs.all(tools);
  return runs.raws;
}

interface StyleOutcome {
  part: StylePart;
  tool: StyleTool | null;
}

// Цепочка стиля над уже готовыми частями (по порядку; null — инструмент упал): то же правило, что у задания. Его же
// зовёт стенд, где сняты все инструменты сразу.
export async function chainStyle(
  tools: StyleTool[],
  partOf: (tool: StyleTool) => Promise<StylePart | null>,
): Promise<StyleOutcome> {
  const parts: StylePart[] = [];
  let first: StyleTool | null = null;
  for (const tool of tools) {
    if (parts.length > 0 && missingPaths(mergeParts(parts)).length === 0) break;
    const part = await partOf(tool);
    if (part === null || isEmptyPart(part)) continue;
    parts.push(part);
    first ??= tool;
  }
  return { part: mergeParts(parts), tool: first };
}

const styleChain = (tools: StyleTool[], runs: TabRuns, facts: ToolFacts): Promise<StyleOutcome> =>
  chainStyle(tools, async (tool) => {
    const raw = await runs.get(tool);
    return raw === null ? null : tool.style(raw.value, facts);
  });

async function outlineChain(tools: OutlineTool[], runs: TabRuns): Promise<{ tool: OutlineTool; raw: unknown } | null> {
  for (const tool of tools) {
    const raw = await runs.get(tool);
    if (raw !== null) return { tool, raw: raw.value };
  }
  return null;
}

// Содержимое своего сайта — до чужих инструментов: dembrandt раскрывает меню и закрывает баннеры. Номер блока
// содержимого — номер блока контура DOM (оба переходника контура размечают те же блоки).
async function contentOf(captured: Captured, owned: boolean, budgetMs: number): Promise<OwnContent | null> {
  if (!owned) return null;
  const raw = await captured
    .evaluate(pageScript('content'), Math.max(1_000, Math.min(budgetMs, CONTENT_MS)))
    .catch(() => null);
  return raw === null ? EMPTY_CONTENT : parseContent(raw, captured.dom.length);
}

const bytesOf = (value: unknown): number => Buffer.byteLength(JSON.stringify(value) ?? '', 'utf8');

// Сырые ответы не больше предела: самые тяжёлые заменяются отметкой «обрезано» с размером, пока не влезет.
export function capRaw(raw: Record<string, unknown>, limit = RAW_LIMIT_BYTES): Record<string, unknown> {
  const sized = Object.entries(raw)
    .map(([key, value]) => ({ key, value, bytes: bytesOf(value) }))
    .sort((a, b) => b.bytes - a.bytes);
  let total = sized.reduce((sum, entry) => sum + entry.bytes, 0);
  const capped = sized.map((entry) => {
    if (total <= limit) return entry;
    total -= entry.bytes;
    return { ...entry, value: { truncated: true, bytes: entry.bytes } };
  });
  return Object.fromEntries(capped.map((entry) => [entry.key, entry.value]));
}

async function measure(deps: RunDeps, input: RunInput, captured: Captured, startedAt: number): Promise<DesignSnapshot> {
  const budget = (): number => input.deadline - deps.now() - MARGIN_MS;
  const captureMs = deps.now() - startedAt;
  const content = await contentOf(captured, input.owned, budget());
  const runs = new TabRuns(captured, budget, deps.now);
  await runs.all(firstRound(deps.style, deps.outline));
  const { raws } = runs;
  const google = new Set(captured.google.map((name) => name.toLowerCase()));
  const early: ToolFacts = { google, dom: captured.dom, bands: [] };
  const style = await styleChain(deps.style, runs, early);
  if (style.tool === null)
    throw new DesignError('tool-failed', `стиль не снялся: ${JSON.stringify(raws.errors).slice(0, 300)}`);
  const siteStyle = finishStyle(style.part, { url: input.url, finalUrl: captured.finalUrl, title: captured.title });
  const facts: ToolFacts = { ...early, bands: siteStyle.bands };
  const outlined = await outlineChain(deps.outline, runs);
  const outline: PageOutline = outlined === null ? { v: 1, blocks: [] } : outlined.tool.outline(outlined.raw, facts);
  return {
    v: 1,
    ok: true,
    tool: style.tool.name,
    toolVersion: style.tool.version,
    outlineTool: outlined?.tool.name ?? 'none',
    ms: deps.now() - startedAt,
    style: siteStyle,
    outline,
    content,
    raw: rawOf(raws, captureMs),
  };
}

// Сырые ответы для `design_looks`: ответы инструментов, время по частям (захват и каждый инструмент) и ошибки.
const rawOf = (raws: Raws, captureMs: number): Record<string, unknown> =>
  capRaw({
    ...raws.values,
    ms: { capture: captureMs, ...raws.ms },
    ...(Object.keys(raws.errors).length > 0 ? { errors: raws.errors } : {}),
  });

function untilDeadline<T>(work: Promise<T>, deadline: number, now: () => number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const limit = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () => reject(new DesignError('timeout', 'Сайт не снялся за отведённое время')),
      Math.max(0, deadline - now()),
    );
  });
  return Promise.race([work, limit]).finally(() => clearTimeout(timer));
}

// Снятие целиком; браузер задания закрывается всегда. Отказы — DesignError с кодом контракта.
export async function runDesign(deps: RunDeps, input: RunInput): Promise<DesignSnapshot> {
  const startedAt = deps.now();
  const capturing = deps.capture(input.url);
  // Срок вышел раньше захвата — браузер, который ещё поднимется, закрываем, когда он поднимется.
  const session = await untilDeadline(capturing, input.deadline, deps.now).catch((error: unknown) => {
    void capturing.then(
      (late) => late.close(),
      () => undefined,
    );
    throw error;
  });
  try {
    return await untilDeadline(measure(deps, input, session.captured, startedAt), input.deadline, deps.now);
  } finally {
    await session.close();
  }
}
