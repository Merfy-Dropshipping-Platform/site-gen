import { SECTION_TAG } from '../element';
import { messageOf } from '../report';
import { SDK_MARKUP_SELECTOR, startInstance, type Instance, type InstanceRuntime } from './instance';
import {
  PREVIEW_REPLACE_EVENT,
  REPLACE_TEXT,
  SCRIPT_HASH,
  type PreviewCodeRef,
  type PreviewReplaceDetail,
  type ReplaceOutcome,
} from './preview-protocol';
import type { SectionDef, SectionEntry } from './types';

// Замена экземпляра секции в превью (блок 5 «Секций и SDK», часть 5г; design.md блока 5, раздел 3.11). Слушатель
// merfy:preview:replace ставит только бандл превью — start({ ..., preview: watchPreviewReplace }); на опубликованном
// сайте этого кода нет. <merfy-section> остаётся тем же узлом: ядро снимает прежний экземпляр, ставит атрибуты и
// содержимое из HTML ответа и запускает новый экземпляр с копией ctx.state. Ошибка запуска — ещё раз без состояния и с
// чистым HTML; снова ошибка — сбой (раздел 3.7). Итог — reply(outcome, message) скрипту превью.

export interface ReplaceDeps {
  readonly runtime: InstanceRuntime;
  readonly byName: Map<string, SectionEntry>; // тот же список, по которому ядро запускает новые экземпляры
  readonly instances: Map<HTMLElement, Instance>;
  readonly signal: AbortSignal;
}

type Saved = Readonly<Record<string, unknown>>;

interface Reply {
  readonly outcome: ReplaceOutcome;
  readonly message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isCodeRef = (value: unknown): value is PreviewCodeRef =>
  isRecord(value) && typeof value.hash === 'string' && SCRIPT_HASH.test(value.hash) && isStringList(value.uses);

function isReplaceDetail(value: unknown): value is PreviewReplaceDetail {
  return (
    isRecord(value) &&
    typeof value.html === 'string' &&
    typeof value.codeOnly === 'boolean' &&
    typeof value.load === 'function' &&
    typeof value.reply === 'function' &&
    (value.script === null || isCodeRef(value.script))
  );
}

// Любое непустое имя — допустимое uses: части проверяет partApi при запуске экземпляра (Р5г-5), на месте — сбой
// part-unknown, как на опубликованном сайте.
const isUse = (value: string): value is SectionEntry['uses'][number] => value !== '';

const usesOf = (names: readonly string[]): readonly SectionEntry['uses'][number][] => names.filter(isUse);

function isFunction(value: unknown): value is () => unknown {
  return typeof value === 'function';
}

// Определение секции из модуля ответа: mount и unmount — функции или их нет, actions — нет или объект функций.
function isDefinition(value: unknown): value is SectionDef<object, never> {
  if (!isRecord(value) || Array.isArray(value)) return false;
  const mount = value.mount;
  const unmount = value.unmount;
  const actions = value.actions;
  if (mount !== undefined && !isFunction(mount)) return false;
  if (unmount !== undefined && !isFunction(unmount)) return false;
  if (actions === undefined) return true;
  return isRecord(actions) && Object.values(actions).every(isFunction);
}

function sectionIdOf(node: Element): string | null {
  if (!node.matches(SECTION_TAG)) return null;
  const id = node.getAttribute('data-section-id');
  return id === null || id === '' ? null : id;
}

// HTML ответа → новый <merfy-section>: ровно один элемент с тем же data-section-id; скрипты внутри <template> не
// запускаются, поэтому разбор безопасен.
function freshOf(doc: Document, html: string, id: string): Element | null {
  const template = doc.createElement('template');
  template.innerHTML = html;
  const fresh = template.content.firstElementChild;
  if (template.content.childElementCount !== 1 || fresh === null) return null;
  if (fresh.tagName.toLowerCase() !== SECTION_TAG) return null;
  return fresh.getAttribute('data-section-id') === id ? fresh : null;
}

type CodeStep = 'same' | 'changed' | 'stopped';

// Код секции по строке списка бандла: null — строку убрать; тот же hash — uses из ответа; другой — load() и новая
// строка. Отказ загрузки и «не определение» — reply и 'stopped': строка не меняется, hash не запоминается.
async function codeStep(deps: ReplaceDeps, name: string, detail: PreviewReplaceDetail): Promise<CodeStep> {
  const entry = deps.byName.get(name);
  if (detail.script === null) {
    if (entry === undefined) return 'same';
    deps.byName.delete(name);
    return 'changed';
  }
  const { hash, uses } = detail.script;
  if (entry !== undefined && entry.script === hash) {
    deps.byName.set(name, { ...entry, uses: usesOf(uses) });
    return 'same';
  }
  let definition: unknown;
  try {
    definition = await detail.load();
  } catch (error) {
    detail.reply('reloaded', messageOf(error));
    return 'stopped';
  }
  if (!isDefinition(definition)) {
    detail.reply('failed', REPLACE_TEXT.notDefinition);
    return 'stopped';
  }
  deps.byName.set(name, {
    name,
    kind: entry?.kind ?? 'section',
    script: hash,
    uses: usesOf(uses),
    definition,
  });
  return 'changed';
}

// Копия состояния через JSON: цикл или не объект — без состояния (Р5г-4).
function copyState(state: unknown): Saved | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(JSON.stringify(state ?? null));
  } catch {
    return null; // цикл в состоянии: замена идёт без состояния (Р5г-4)
  }
  if (!isRecord(parsed)) return null;
  return Object.keys(parsed).length === 0 ? null : parsed;
}

// Каждая попытка начинается с чистого HTML ответа: атрибуты и дети — копия из fresh.
function swap(element: HTMLElement, fresh: Element): void {
  [...element.attributes].forEach(({ name }) => element.removeAttribute(name));
  [...fresh.attributes].forEach(({ name, value }) => element.setAttribute(name, value));
  const children = [...fresh.childNodes].map((node) => node.cloneNode(true));
  element.replaceChildren(...children);
}

const hasMarkup = (element: HTMLElement): boolean =>
  element.matches(SDK_MARKUP_SELECTOR) || element.querySelector(SDK_MARKUP_SELECTOR) !== null;

async function replaceSection(deps: ReplaceDeps, element: HTMLElement, detail: PreviewReplaceDetail): Promise<void> {
  const id = element.getAttribute('data-section-id') ?? '';
  const fresh = freshOf(deps.runtime.win.document, detail.html, id);
  if (fresh === null) {
    detail.reply('failed', REPLACE_TEXT.wrongHtml);
    return;
  }
  const name = fresh.getAttribute('data-section') ?? '';
  const step = await codeStep(deps, name, detail);
  if (step === 'stopped') return;
  if (step === 'same' && detail.codeOnly) {
    detail.reply('kept-state', '');
    return;
  }
  if (!element.isConnected) {
    detail.reply('failed', REPLACE_TEXT.gone);
    return;
  }
  const reply = await restart(deps, element, fresh, name);
  detail.reply(reply.outcome, reply.message);
}

// Одна попытка: снять прежний экземпляр, поставить HTML ответа, запустить новый экземпляр и отдать ему события
// страницы (13б Г). null — запустился (или запускать нечего), текст — ошибка запуска.
function attempt(deps: ReplaceDeps, element: HTMLElement, fresh: Element, saved: Saved | null): Promise<string | null> {
  deps.instances.get(element)?.teardown();
  deps.instances.delete(element);
  swap(element, fresh);
  const entry = deps.byName.get(element.getAttribute('data-section') ?? '') ?? null;
  if (entry === null && !hasMarkup(element)) return Promise.resolve(null);
  const instance = startInstance(deps.runtime, element, entry, saved ?? undefined);
  deps.instances.set(element, instance);
  deps.runtime.bus.deliver(instance.owner, 'merfy:page:ready', {});
  deps.runtime.bus.deliver(instance.owner, 'merfy:page:view', { path: deps.runtime.win.location.pathname });
  return instance.settled;
}

async function restart(deps: ReplaceDeps, element: HTMLElement, fresh: Element, name: string): Promise<Reply> {
  const saved = deps.byName.has(name) ? copyState(deps.instances.get(element)?.currentState()) : null;
  const first = await attempt(deps, element, fresh, saved);
  if (first === null) return { outcome: saved === null ? 'fresh' : 'kept-state', message: '' };
  if (saved === null || !element.isConnected) return { outcome: 'failed', message: first };
  const second = await attempt(deps, element, fresh, null);
  return second === null ? { outcome: 'fresh', message: '' } : { outcome: 'failed', message: second };
}

// Слушатель замены на document, снимается по deps.signal. Цель — подключённый к документу <merfy-section> с
// data-section-id (sectionIdOf), detail — isReplaceDetail; иначе событие не отменяется и скрипт превью ставит HTML сам.
// Иначе preventDefault и replaceSection; исключение внутри — reply('failed', messageOf(ошибки)): очередь не встаёт.
export function watchPreviewReplace(deps: ReplaceDeps): void {
  const listener = (event: Event): void => {
    const target = event.target;
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;
    if (!(target instanceof HTMLElement) || sectionIdOf(target) === null || !target.isConnected) return;
    if (!isReplaceDetail(detail)) return;
    event.preventDefault();
    void replaceSection(deps, target, detail).catch((error: unknown) => {
      detail.reply('failed', messageOf(error));
    });
  };
  deps.runtime.win.document.addEventListener(PREVIEW_REPLACE_EVENT, listener, { signal: deps.signal });
}
