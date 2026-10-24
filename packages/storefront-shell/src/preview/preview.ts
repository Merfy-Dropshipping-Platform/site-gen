import { messageOf } from '../report';
import {
  MESSAGE_MAX_LENGTH,
  PREVIEW_BUNDLE_TAG_ID,
  PREVIEW_REPLACE_EVENT,
  PREVIEW_UPDATE_EVENT,
  PREVIEW_UPDATED_EVENT,
  REPLACE_LIMIT,
  SCRIPT_HASH,
  SECTION_UPDATED_MESSAGE,
  type PreviewReplaceDetail,
  type PreviewScript,
  type PreviewUpdateDetail,
  type SectionUpdated,
  type UpdateOutcome,
} from '../core/preview-protocol';

// Скрипт превью (блок 5 «Секций и SDK», часть 5г; design.md блока 5, раздел 3.11) — dist/preview.js: сборщик вставляет
// его текстом в HTML превью после JSON-тега с бандлом страницы. Загружает бандл модулем (importCode), принимает
// merfy:preview:update от скрипта секций превью, ведёт очередь по одной правке и передаёт ядру merfy:preview:replace.
// Итог — section-updated конструктору и merfy:preview:updated странице; reloaded — перезагрузка превью.

export interface PreviewEnv {
  readonly win: Window;
  readonly importCode: (code: string) => Promise<unknown>; // модуль из текста; в браузере — через blob: (entry.ts)
  readonly reload: () => void;
}

export const LIMIT_TEXT = `загрузок кода секций без перезагрузки — ${REPLACE_LIMIT}: превью загружается заново`;
export const BUNDLE_FAILED_TEXT = 'код страницы превью не загрузился';

interface TurnState {
  loads: number; // загрузок кода секций без перезагрузки; REPLACE_LIMIT — перезагрузка (Р5г-6)
  reloaded: boolean;
}

interface Edit {
  readonly id: string;
  readonly number: number; // номер правки секции: не последний к моменту хода — superseded
  readonly detail: PreviewUpdateDetail;
}

interface CoreReply {
  readonly outcome: UpdateOutcome;
  readonly message: string;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isStringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isScript = (value: unknown): value is PreviewScript =>
  isRecord(value) &&
  typeof value.hash === 'string' &&
  SCRIPT_HASH.test(value.hash) &&
  typeof value.code === 'string' &&
  isStringList(value.uses);

function isUpdateDetail(value: unknown): value is PreviewUpdateDetail {
  return (
    isRecord(value) &&
    typeof value.html === 'string' &&
    typeof value.codeOnly === 'boolean' &&
    (value.script === null || isScript(value.script))
  );
}

const cut = (message: string): string => message.slice(0, MESSAGE_MAX_LENGTH);

// Секция по id: перебор атрибутов, id в селектор не подставляется.
function sectionById(doc: Document, id: string): HTMLElement | null {
  const nodes = doc.querySelectorAll('merfy-section[data-section-id]');
  for (const node of nodes) {
    if (node instanceof HTMLElement && node.getAttribute('data-section-id') === id) return node;
  }
  return null;
}

// Ошибка бандла: строка в консоли и render-error конструктору; рамка без allow-same-origin — адрес отсюда не виден.
function bundleFailed(env: PreviewEnv, error: unknown): void {
  const message = cut(`${BUNDLE_FAILED_TEXT}: ${messageOf(error)}`);
  console.error(message);
  env.win.parent.postMessage({ type: 'render-error', message }, '*');
}

// Тег бандла — строка JSON; не строка, ошибка разбора или загрузки — ошибка бандла, правки идут дальше.
function bundleOf(env: PreviewEnv): Promise<void> {
  const tag = env.win.document.getElementById(PREVIEW_BUNDLE_TAG_ID);
  if (tag === null) return Promise.resolve();
  try {
    const code: unknown = JSON.parse(tag.textContent ?? '');
    if (typeof code !== 'string') throw new Error('тег бандла превью — не строка JSON');
    return env.importCode(code).then(
      () => undefined,
      (error: unknown) => bundleFailed(env, error),
    );
  } catch (error) {
    bundleFailed(env, error);
    return Promise.resolve();
  }
}

// Загрузка кода секции: двадцатая — отказ без загрузки (Р5г-6); модуль отдаёт export default.
function loadOf(env: PreviewEnv, state: TurnState, script: PreviewScript): () => Promise<unknown> {
  return () => {
    state.loads += 1;
    if (state.loads >= REPLACE_LIMIT) return Promise.reject(new Error(LIMIT_TEXT));
    return env.importCode(script.code).then((module: unknown) => (isRecord(module) ? module.default : undefined));
  };
}

// Событие замены на секции: ядро отменяет его и отвечает через reply; не отменило — HTML ставим сами.
function askCore(env: PreviewEnv, state: TurnState, node: HTMLElement, edit: Edit): Promise<CoreReply> {
  return new Promise((resolve) => {
    const script = edit.detail.script;
    const detail: PreviewReplaceDetail = {
      html: edit.detail.html,
      codeOnly: edit.detail.codeOnly,
      script: script === null ? null : { hash: script.hash, uses: script.uses },
      load: script === null ? () => Promise.resolve(undefined) : loadOf(env, state, script),
      reply: (outcome, message) => resolve({ outcome, message }),
    };
    const event = new CustomEvent(PREVIEW_REPLACE_EVENT, { bubbles: true, cancelable: true, detail });
    if (node.dispatchEvent(event)) resolve(ownOutcome(node, edit.detail));
  });
}

// Ядра нет: codeOnly — HTML на месте; иначе секцию заменяет первый элемент шаблона из ответа.
function ownOutcome(node: HTMLElement, detail: PreviewUpdateDetail): CoreReply {
  if (detail.codeOnly) return { outcome: 'kept-state', message: '' };
  const template = node.ownerDocument.createElement('template');
  template.innerHTML = detail.html;
  const fresh = template.content.firstElementChild;
  if (fresh !== null) node.replaceWith(fresh.cloneNode(true));
  return { outcome: 'fresh', message: '' };
}

// Один ход очереди: свежий номер правки и секция на месте — событие ядру; итог — конструктору и странице.
async function turnOf(env: PreviewEnv, state: TurnState, edits: Map<string, number>, edit: Edit): Promise<void> {
  let reply: CoreReply;
  if (edits.get(edit.id) !== edit.number) {
    reply = { outcome: 'superseded', message: '' };
  } else {
    const node = sectionById(env.win.document, edit.id);
    reply = node === null ? { outcome: 'absent', message: '' } : await askCore(env, state, node, edit);
  }
  finish(env, state, { id: edit.id, outcome: reply.outcome, message: cut(reply.message) });
}

// Итог хода: section-updated родителю, merfy:preview:updated странице; reloaded — перезагрузка один раз.
function finish(env: PreviewEnv, state: TurnState, result: SectionUpdated): void {
  env.win.parent.postMessage({ type: SECTION_UPDATED_MESSAGE, ...result }, '*');
  env.win.document.dispatchEvent(new CustomEvent(PREVIEW_UPDATED_EVENT, { detail: result }));
  if (result.outcome === 'reloaded' && !state.reloaded) {
    state.reloaded = true;
    env.reload();
  }
}

export function startPreview(env: PreviewEnv): () => void {
  const edits = new Map<string, number>();
  const state: TurnState = { loads: 0, reloaded: false };
  let queue = bundleOf(env); // первое звено очереди — загрузка бандла страницы
  const listener = (event: Event): void => {
    const target = event.target;
    const detail: unknown = event instanceof CustomEvent ? event.detail : null;
    if (!(target instanceof HTMLElement) || target.getAttribute('data-section-id') === null) return;
    if (!isUpdateDetail(detail)) return;
    event.preventDefault();
    const id = target.getAttribute('data-section-id') ?? '';
    const number = (edits.get(id) ?? 0) + 1;
    edits.set(id, number);
    queue = queue.then(() => turnOf(env, state, edits, { id, number, detail }));
  };
  env.win.document.addEventListener(PREVIEW_UPDATE_EVENT, listener);
  return () => env.win.document.removeEventListener(PREVIEW_UPDATE_EVENT, listener);
}
