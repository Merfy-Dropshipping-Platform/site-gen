import type { Session } from './design-capture';
import { chainStyle } from './design-run';
import { finishStyle, type StylePart } from './design-style';
import { DesignError, type PageOutline, type SiteStyle } from './design-types';
import type { OutlineTool, StyleTool, ToolFacts } from './tools/tool';

// Стенд «Дизайна по ссылке» для экспериментов владельца: на каждый сайт — один захват и все подключённые переходники
// (стиль и контур), их время, ошибки, наш формат и сырой ответ, плюс итог по цепочкам DESIGN_STYLE / DESIGN_OUTLINE, как
// у задания. Отчёт — HTML (`labHtml`) и JSON. Команда — `pnpm --filter @merfy/storefront-builder design-lab`.

export interface LabTool {
  kind: 'style' | 'outline';
  name: string;
  version: string;
  ms: number;
  error: string | null;
  style: SiteStyle | null;
  outline: PageOutline | null;
  raw: unknown;
}

export interface LabSite {
  url: string;
  finalUrl: string | null;
  ms: number;
  error: { code: string; message: string } | null;
  screen: string | null;
  tools: LabTool[];
  chosen: { tool: string | null; outlineTool: string | null; style: SiteStyle | null; outline: PageOutline | null };
}

export interface LabDeps {
  capture: (url: string) => Promise<Session>;
  style: StyleTool[];
  outline: OutlineTool[];
  chainStyle: StyleTool[];
  chainOutline: OutlineTool[];
  now: () => number;
  budgetMs: number;
}

type Timed = { raw: unknown; ms: number; error: string | null };

const message = (error: unknown): string => String(error instanceof Error ? error.message : error).slice(0, 300);

async function timed(work: () => Promise<unknown>, now: () => number): Promise<Timed> {
  const startedAt = now();
  try {
    return { raw: await work(), ms: now() - startedAt, error: null };
  } catch (error) {
    return { raw: null, ms: now() - startedAt, error: message(error) };
  }
}

function emptySite(url: string, ms: number, error: unknown): LabSite {
  const code = error instanceof DesignError ? error.code : 'tool-failed';
  return {
    url,
    finalUrl: null,
    ms,
    error: { code, message: message(error) },
    screen: null,
    tools: [],
    chosen: { tool: null, outlineTool: null, style: null, outline: null },
  };
}

function styleOf(
  tool: StyleTool,
  run: Timed,
  facts: ToolFacts,
  source: Parameters<typeof finishStyle>[1],
): { part: StylePart | null; style: SiteStyle | null } {
  if (run.error !== null) return { part: null, style: null };
  const part = tool.style(run.raw, facts);
  return { part, style: finishStyle(part, source) };
}

// Все инструменты разом (designlang — один раз на стиль и контур): сырой ответ, время, ошибка.
async function runAll(deps: LabDeps, captured: Session['captured']): Promise<(name: string) => Timed> {
  const tools = [...new Map([...deps.style, ...deps.outline].map((tool) => [tool.name, tool])).values()];
  const budgetMs = deps.budgetMs;
  const pairs = await Promise.all(
    tools.map(async (tool) => [tool.name, await timed(() => tool.raw({ captured, budgetMs }), deps.now)] as const),
  );
  const runs = new Map(pairs);
  return (name) => runs.get(name) ?? { raw: null, ms: 0, error: 'не запускался' };
}

async function measureSite(deps: LabDeps, session: Session, url: string, startedAt: number): Promise<LabSite> {
  const { captured } = session;
  const run = await runAll(deps, captured);
  const source = { url, finalUrl: captured.finalUrl, title: captured.title };
  const google = new Set(captured.google.map((name) => name.toLowerCase()));
  const facts: ToolFacts = { google, dom: captured.dom, bands: [] };
  const styles = new Map(deps.style.map((tool) => [tool.name, styleOf(tool, run(tool.name), facts, source)]));
  const chosen = await chainStyle(deps.chainStyle, (tool) => Promise.resolve(styles.get(tool.name)?.part ?? null));
  const style = chosen.tool === null ? null : finishStyle(chosen.part, source);
  const withBands: ToolFacts = { ...facts, bands: style?.bands ?? [] };
  const outlineOf = (tool: OutlineTool): PageOutline | null =>
    run(tool.name).error === null ? tool.outline(run(tool.name).raw, withBands) : null;
  const firstOutline = deps.chainOutline.find((tool) => run(tool.name).error === null) ?? null;
  const shots = await captured.shot().catch(() => null);
  const head = { url, finalUrl: captured.finalUrl, ms: deps.now() - startedAt, error: null };
  return {
    ...head,
    screen: shots === null ? null : shots.full.toString('base64'),
    tools: labTools(deps, run, styles, outlineOf),
    chosen: {
      tool: chosen.tool?.name ?? null,
      outlineTool: firstOutline?.name ?? null,
      style,
      outline: firstOutline === null ? null : outlineOf(firstOutline),
    },
  };
}

function labTools(
  deps: LabDeps,
  run: (name: string) => Timed,
  styles: Map<string, { style: SiteStyle | null }>,
  outlineOf: (tool: OutlineTool) => PageOutline | null,
): LabTool[] {
  return [
    ...deps.style.map((tool) => ({
      kind: 'style' as const,
      name: tool.name,
      version: tool.version,
      ...pickRun(run(tool.name)),
      style: styles.get(tool.name)?.style ?? null,
      outline: null,
    })),
    ...deps.outline.map((tool) => ({
      kind: 'outline' as const,
      name: tool.name,
      version: tool.version,
      ...pickRun(run(tool.name)),
      style: null,
      outline: outlineOf(tool),
    })),
  ];
}

const pickRun = (run: Timed): Pick<LabTool, 'ms' | 'error' | 'raw'> => ({ ms: run.ms, error: run.error, raw: run.raw });

export async function labSite(deps: LabDeps, url: string): Promise<LabSite> {
  const startedAt = deps.now();
  let session: Session;
  try {
    session = await deps.capture(url);
  } catch (error) {
    return emptySite(url, deps.now() - startedAt, error);
  }
  try {
    return await measureSite(deps, session, url, startedAt);
  } catch (error) {
    return emptySite(url, deps.now() - startedAt, error);
  } finally {
    await session.close();
  }
}

// Список сайтов: адрес — первое слово строки, «#» — заметка, пустые строки пропускаются.
export const parseSites = (text: string): string[] =>
  text
    .split('\n')
    .map((line) => (line.split('#')[0] ?? '').trim().split(/\s+/)[0] ?? '')
    .filter((word) => /^https?:\/\//.test(word));

const escape = (value: string | number | null): string =>
  String(value ?? '').replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char] ?? char,
  );

const swatch = (color: string | null, label: string): string =>
  color === null
    ? ''
    : `<span class="sw" style="background:${escape(color)}" title="${escape(label)} ${escape(color)}"></span>`;

function styleHtml(style: SiteStyle | null): string {
  if (style === null) return '<p class="muted">—</p>';
  const bands = style.bands
    .map(
      (band) =>
        `<div class="band">${swatch(band.bg, 'фон')}${swatch(band.fg, 'текст')}${swatch(band.heading, 'заголовок')}${swatch(band.primary, 'кнопка')}${swatch(band.secondary, 'вторая')} ${Math.round(band.area * 100)}% · ${band.top}px${band.dark ? ' · тёмная' : ''}</div>`,
    )
    .join('');
  const font = (role: 'heading' | 'body'): string => {
    const found = style.fonts[role];
    return `${escape(found.family)} (${found.category}, ${found.weight}, ${found.source}, кириллица: ${String(found.cyrillic)})`;
  };
  const radius = Object.entries(style.radius)
    .map(([key, value]) => `${key} ${value ?? '—'}`)
    .join(', ');
  return `${bands}<p>Заголовки: ${font('heading')}<br>Текст: ${font('body')}<br>Радиусы: ${escape(radius)}<br>Кнопка: ${style.button.look} · карточка: ${style.card.look}/${style.card.align} · отступ секций: ${style.spacing.sectionGap ?? '—'} · ширина: ${style.widthPage ?? '—'}</p>`;
}

function outlineHtml(outline: PageOutline | null): string {
  if (outline === null) return '<p class="muted">—</p>';
  const rows = outline.blocks.map(
    (block, index) =>
      `<li>${index}. <b>${block.role}</b> ${Math.round(block.confidence * 100)}% · ${block.box.h}px · ${block.layout}/${block.columns} · полоса ${block.band}${block.heading ? ` — ${escape(block.heading)}` : ''}</li>`,
  );
  return `<ol class="outline">${rows.join('')}</ol>`;
}

const rawHtml = (raw: unknown): string =>
  `<details><summary>сырой ответ</summary><pre>${escape(JSON.stringify(raw, null, 1).slice(0, 200_000))}</pre></details>`;

function toolHtml(tool: LabTool): string {
  const body = tool.kind === 'style' ? styleHtml(tool.style) : outlineHtml(tool.outline);
  const state = tool.error === null ? 'ok' : `<span class="err">${escape(tool.error)}</span>`;
  return `<div class="tool"><h4>${tool.kind} · ${escape(tool.name)} ${escape(tool.version)} · ${tool.ms} мс · ${state}</h4>${body}${rawHtml(tool.raw)}</div>`;
}

function siteHtml(site: LabSite): string {
  const head = `<h2><a href="${escape(site.url)}">${escape(site.url)}</a> · ${(site.ms / 1000).toFixed(1)} с</h2>`;
  if (site.error !== null)
    return `<section>${head}<p class="err">${escape(site.error.code)}: ${escape(site.error.message)}</p></section>`;
  const shot = site.screen === null ? '' : `<img class="shot" src="data:image/jpeg;base64,${site.screen}" alt="">`;
  const chosen = `<div class="tool chosen"><h4>итог цепочек: стиль ${escape(site.chosen.tool)}, контур ${escape(site.chosen.outlineTool)}</h4>${styleHtml(site.chosen.style)}${outlineHtml(site.chosen.outline)}</div>`;
  return `<section>${head}<div class="row"><div class="shotcol">${shot}</div><div class="tools">${chosen}${site.tools.map(toolHtml).join('')}</div></div></section>`;
}

export function summaryLine(site: LabSite): string {
  const status =
    site.error === null
      ? `стиль ${site.chosen.tool ?? '—'}, контур ${site.chosen.outlineTool ?? '—'}, полос ${site.chosen.style?.bands.length ?? 0}, блоков ${site.chosen.outline?.blocks.length ?? 0}`
      : `${site.error.code}: ${site.error.message}`;
  return `${site.url} — ${(site.ms / 1000).toFixed(1)} с — ${status}`;
}

const CSS = `body{font:14px/1.4 system-ui;margin:24px;color:#16181d}section{border-top:2px solid #ddd;padding:16px 0}.row{display:flex;gap:16px}.shotcol{flex:0 0 360px}.shot{width:360px;border:1px solid #ddd}.tools{flex:1;min-width:0}.tool{border:1px solid #eee;border-radius:8px;padding:8px 12px;margin:0 0 8px}.chosen{background:#f6faf9}.sw{display:inline-block;width:22px;height:22px;border:1px solid #ccc;border-radius:4px;margin-right:4px;vertical-align:middle}.band{margin:2px 0}.err{color:#b00020}.muted{color:#888}pre{max-height:400px;overflow:auto;background:#fafafa;font-size:12px}h4{margin:4px 0}`;

export function labHtml(sites: LabSite[], startedAt: string): string {
  const lines = sites.map((site) => `<li>${escape(summaryLine(site))}</li>`).join('');
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Стенд «Дизайн по ссылке»</title><style>${CSS}</style></head><body><h1>Стенд «Дизайн по ссылке» · ${escape(startedAt)}</h1><ul>${lines}</ul>${sites.map(siteHtml).join('')}</body></html>`;
}
