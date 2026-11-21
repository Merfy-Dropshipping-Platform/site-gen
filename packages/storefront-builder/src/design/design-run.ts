import type { Captured, Session } from './design-capture';
import { EMPTY_CONTENT, parseContent } from './design-content';
import { pageScript } from './design-scripts';
import { finishStyle, isEmptyPart, mergeParts, missingPaths, type StylePart } from './design-style';
import { DesignError, type DesignSnapshot, type OwnContent, type PageOutline } from './design-types';
import { ToolFailed, type OutlineTool, type StyleTool, type ToolFacts } from './tools/tool';

// Одно снятие дизайна: захват → цепочка стиля и цепочка контура параллельно → содержимое своего сайта (owned) →
// ответ контракта. В цепочке стиля инструменты идут по порядку DESIGN_STYLE: упал или пусто — следующий; ответил, но не
// всё — следующий дозаполняет недостающее (`missingPaths`), у поля побеждает самое уверенное значение. В цепочке
// контура — первый, кто ответил. Сырой ответ одного инструмента в задании снимается один раз (designlang есть в обеих
// цепочках). Имя инструмента и сырые ответы идут только в ответ для `design_looks` — модели их не отдают.

export const RAW_LIMIT_BYTES = 512 * 1024;
// Запас до срока задания: ответ ещё нужно собрать и отправить.
const MARGIN_MS = 2_000;

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

type Tool = { name: string; raw: StyleTool['raw'] };

// Сырые ответы задания: один запуск на инструмент, ошибки — по имени.
class Raws {
  private readonly runs = new Map<string, Promise<unknown>>();
  readonly errors: Record<string, string> = {};
  readonly values: Record<string, unknown> = {};

  constructor(
    private readonly captured: Captured,
    private readonly budget: () => number,
  ) {}

  get(tool: Tool): Promise<unknown> {
    const running = this.runs.get(tool.name) ?? this.start(tool);
    this.runs.set(tool.name, running);
    return running;
  }

  private async start(tool: Tool): Promise<unknown> {
    const budgetMs = this.budget();
    if (budgetMs <= 0) throw new ToolFailed('срок задания вышел');
    try {
      const value = await tool.raw({ captured: this.captured, budgetMs });
      this.values[tool.name] = value;
      return value;
    } catch (error) {
      this.errors[tool.name] = String(error instanceof Error ? error.message : error).slice(0, 300);
      throw error;
    }
  }
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

const styleChain = (tools: StyleTool[], raws: Raws, facts: ToolFacts): Promise<StyleOutcome> =>
  chainStyle(tools, (tool) =>
    raws.get(tool).then(
      (raw) => tool.style(raw, facts),
      () => null,
    ),
  );

async function outlineChain(tools: OutlineTool[], raws: Raws): Promise<{ tool: OutlineTool; raw: unknown } | null> {
  for (const tool of tools) {
    const raw = await raws.get(tool).then(
      (value) => ({ value }),
      () => null,
    );
    if (raw !== null) return { tool, raw: raw.value };
  }
  return null;
}

async function contentOf(
  captured: Captured,
  owned: boolean,
  blocks: number,
  budgetMs: number,
): Promise<OwnContent | null> {
  if (!owned) return null;
  const raw = await captured
    .evaluate(pageScript('content'), Math.max(1_000, Math.min(budgetMs, 15_000)))
    .catch(() => null);
  return raw === null ? EMPTY_CONTENT : parseContent(raw, blocks);
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
  const raws = new Raws(captured, budget);
  const google = new Set(captured.google.map((name) => name.toLowerCase()));
  const early: ToolFacts = { google, dom: captured.dom, bands: [] };
  const [style, outlined] = await Promise.all([styleChain(deps.style, raws, early), outlineChain(deps.outline, raws)]);
  if (style.tool === null)
    throw new DesignError('tool-failed', `стиль не снялся: ${JSON.stringify(raws.errors).slice(0, 300)}`);
  const siteStyle = finishStyle(style.part, { url: input.url, finalUrl: captured.finalUrl, title: captured.title });
  const facts: ToolFacts = { ...early, bands: siteStyle.bands };
  const outline: PageOutline = outlined === null ? { v: 1, blocks: [] } : outlined.tool.outline(outlined.raw, facts);
  const content = await contentOf(captured, input.owned, outline.blocks.length, budget());
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
    raw: capRaw({ ...raws.values, ...(Object.keys(raws.errors).length > 0 ? { errors: raws.errors } : {}) }),
  };
}

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
