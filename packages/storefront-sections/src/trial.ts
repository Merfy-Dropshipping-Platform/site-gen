import {
  SAMPLE_PAGES,
  SAMPLE_SHOP,
  SAMPLE_THEME,
  sha256,
  type MenuTree,
  type PageInfo,
  type SectionRecordValues,
} from '@merfy/storefront-build';
import { fieldUnknownProblems } from './field-unknown';
import { TEMPLATE_FILE } from './format';
import { problem, type SectionProblem } from './problems';
import type { FieldRead, FieldWatch } from './record-shapes';
import { leakHint, renderLeaks } from './render-leak';
import {
  withSectionRenderer,
  type RendererOptions,
  type SectionDrawing,
  type SectionRenderRequest,
  type SectionTracer,
} from './render';
import type { SettingValues, TemplateBlock } from './trial-render';

// Пробный рендер при сохранении (блок 2 «Секций и SDK», «Решил сам» п. 5): модуль шаблона рендерит процесс рендера — с теми же
// правами и пределами, что на витрине. Процесс проверки чужой JS не исполняет: у него WASI, которого у процесса рендера
// нет. Шаблон должен рендериться с умолчаниями настроек, с пустыми строками вместо них (блок 3, Р3.11) и на примерах
// данных магазина (SAMPLE_*, storefront-build). Не упал — мало: HTML каждого рендера сверяется на утечки значений
// (render-leak.ts): объект, выведенный как текст, undefined и NaN — отказ render-leak. На примерах данных записи ещё и под
// наблюдением (28.11, record-shapes.ts): чтение поля, которого у записи нет, — отказ render-field-unknown.

// Итог одного рендера: HTML с чтениями полей или текст ошибки JavaScript.
type Outcome = SectionDrawing | { error: string };

async function attempt(trace: SectionTracer['trace'], request: SectionRenderRequest): Promise<Outcome> {
  try {
    return await trace(request);
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
}

function requestOf(
  render: string,
  settings: SettingValues,
  blocks: readonly TemplateBlock[],
  menus: Readonly<Record<string, MenuTree>>,
): SectionRenderRequest {
  const hash = sha256(Buffer.from(render, 'utf8'));
  return { section: 'trial', hash, module: render, settings, blocks, menus };
}

const LEAKS_MAX = 3;

// render-leak по HTML одного рендера; label — какой это рендер («с умолчаниями настроек»). seen — находки прежних
// рендеров этой проверки: одна и та же находка на другой странице второй раз не сообщается.
function leakProblems(html: string, label: string, onlyObjects = false, seen = new Set<string>()): SectionProblem[] {
  return renderLeaks(html, onlyObjects)
    .filter((leak) => {
      const key = `${leak.place}|${leak.found}|${leak.near}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, LEAKS_MAX)
    .map((leak) =>
      problem(
        'render-leak',
        TEMPLATE_FILE,
        `пробный рендер ${label}: ${leak.place} найдено «${leak.found}» (рядом: «${leak.near}») — ${leakHint(leak)}`,
      ),
    );
}

// Один рендер в своём процессе: ошибка — failed(текст), иначе утечки в HTML.
async function singleTrial(
  request: SectionRenderRequest,
  options: RendererOptions,
  label: string,
  failed: (text: string) => SectionProblem,
): Promise<SectionProblem[]> {
  const outcome = await withSectionRenderer((_render, trace) => attempt(trace, request), options);
  return 'error' in outcome ? [failed(outcome.error)] : leakProblems(outcome.html, label);
}

export async function trialRender(
  render: string,
  settings: SettingValues,
  options: RendererOptions = {},
  blocks: readonly TemplateBlock[] = [],
  menus: Readonly<Record<string, MenuTree>> = {},
): Promise<SectionProblem[]> {
  return singleTrial(requestOf(render, settings, blocks, menus), options, 'с умолчаниями настроек', (text) =>
    problem('render-failed', TEMPLATE_FILE, `шаблон не отрисовался с умолчаниями настроек: ${text}`),
  );
}

// Второй пробный рендер — с пустыми значениями (блок 3 «Секций и SDK», Р3.11), блоков нет.
export async function emptyTrialRender(
  render: string,
  settings: SettingValues,
  options: RendererOptions = {},
  menus: Readonly<Record<string, MenuTree>> = {},
): Promise<SectionProblem[]> {
  return singleTrial(requestOf(render, settings, [], menus), options, 'с пустыми значениями настроек', (text) =>
    problem('render-empty-failed', TEMPLATE_FILE, `шаблон не отрисовался с пустыми значениями настроек: ${text}`),
  );
}

// Примеры данных секции: записи её полей с записями (sampleRecordValues).
export interface TrialSample {
  records: SectionRecordValues;
  // Записи полей с записями в блоках (sampleBlockRecords, 29.10): id блока → id поля → запись.
  blockRecords?: Readonly<Record<string, SectionRecordValues>>;
  // Виды записей полей секции и блоков для наблюдения за чтением полей (28.11); нет — без наблюдения.
  watch?: FieldWatch;
}

// Страницы, на которых секция рисуется сверх главной: каталог со списком и страницы записей. Какой из них секция
// принадлежит, проверка не знает: на чужой странице шаблон законно падает или пуст, поэтому ошибка здесь не отказ и из
// находок считается только объект вместо текста.
const pageLabel = (page: PageInfo): string => `на примерах данных магазина (страница ${page.id})`;

interface SampleFound {
  leaks: SectionProblem[];
  reads: FieldRead[];
}

// Находки рендера на примерах данных: главная (main), затем страницы, пока утечек меньше LEAKS_MAX.
async function sampleFound(
  trace: SectionTracer['trace'],
  base: SectionRenderRequest,
  main: SectionDrawing,
): Promise<SampleFound> {
  const seen = new Set<string>();
  const found = { leaks: leakProblems(main.html, 'на примерах данных магазина', false, seen), reads: [...main.reads] };
  for (const page of SAMPLE_PAGES) {
    if (found.leaks.length >= LEAKS_MAX) break;
    const drawn = await attempt(trace, { ...base, page });
    if ('error' in drawn) continue;
    found.leaks.push(...leakProblems(drawn.html, pageLabel(page), true, seen));
    found.reads.push(...drawn.reads);
  }
  return found;
}

// Третий пробный рендер — на примерах данных магазина: записи полей, данные магазина, настройки темы, затем страницы
// каталога и записей. Один процесс рендера на все страницы. Чтения полей, которых нет, собираются со всех страниц: записи
// полей секции на каждой те же. Данные страницы (page.record, page.list) не наблюдаются: какой странице принадлежит
// секция, проверка не знает, и шаблон страницы товара на странице статьи законно читает у page.record поле товара.
export async function sampleTrialRender(
  render: string,
  settings: SettingValues,
  sample: TrialSample,
  options: RendererOptions = {},
  blocks: readonly TemplateBlock[] = [],
  menus: Readonly<Record<string, MenuTree>> = {},
): Promise<SectionProblem[]> {
  const base = {
    ...requestOf(render, settings, blocks, menus),
    theme: SAMPLE_THEME,
    shop: SAMPLE_SHOP,
    records: sample.records,
    ...(sample.blockRecords === undefined ? {} : { blockRecords: sample.blockRecords }),
    ...(sample.watch === undefined ? {} : { watch: sample.watch }),
  };
  return withSectionRenderer(async (_render, trace) => {
    const main = await attempt(trace, base);
    if ('error' in main)
      return [
        problem('render-failed', TEMPLATE_FILE, `шаблон не отрисовался на примерах данных магазина: ${main.error}`),
      ];
    const { leaks, reads } = await sampleFound(trace, base, main);
    // Поле, которого нет, — первым: утечка undefined рядом с ним обычно его следствие.
    return [...fieldUnknownProblems(reads), ...leaks];
  }, options);
}
