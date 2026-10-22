import type { StorefrontConfig } from '@merfy/storefront-config';
import { SECTION_FAILURE_EVENT } from './core/events';
import { SECTION_ERROR_EVENT, type FailureStage } from './report';

// Канал ошибок секций (design.md блока 7, С7-16 А; план блока 11, часть 4). На витрине (mode: live) ядро копит записи
// merfy:section-error и шлёт их пачкой в шлюз: имя секции, отпечаток её скрипта, стадия и текст. По имени и отпечатку
// сборщик витрин находит в реестре секций автора, владельца и выпуск. Адреса страницы, браузера и данных покупателя в
// записи нет. Отправка — sendBeacon с text/plain: такой запрос браузер шлёт без предварительного OPTIONS, а CORS шлюза
// свой домен магазина не пускает; ответ шлюза никто не читает.
export const ERROR_LOG_PATH = '/storefront/section-errors';
export const ERROR_LOG_VERSION = 1;
export const MAX_RECORDS = 10;
export const MAX_MESSAGE_LENGTH = 300;
export const FLUSH_DELAY_MS = 2_000;
// Скрипт секции лежит по отпечатку: /_merfy/m/<64 знака sha256>.js (сборка магазина, блок 7). Повтор загрузки с
// ?merfy-retry=1 — тот же файл.
const SCRIPT_FILE = /\/_merfy\/m\/([0-9a-f]{64})\.js(?:[?#]|$)/;
const STAGES: readonly string[] = ['load', 'define', 'mount', 'unmount', 'runtime'] satisfies readonly FailureStage[];

export interface ErrorRecord {
  section: string;
  script: string;
  stage: string;
  message: string;
}

export interface ErrorLogDeps {
  // Куда ядро шлёт событие сбоя: каркас — merfy:section-error на окно, ядро секций (блок 5) — merfy:section:error на
  // документ.
  target: EventTarget;
  // Имя события сбоя; без него — merfy:section-error каркаса.
  event?: string;
  // Документ: уход страницы в фон (visibilitychange) отправляет пачку сразу.
  document: EventTarget & { readonly visibilityState: DocumentVisibilityState };
  send: (url: string, body: string) => void;
  later: (run: () => void, ms: number) => void;
  url: string;
  shopId: string;
  signal: AbortSignal;
}

interface LogState {
  seen: Set<string>;
  pending: ErrorRecord[];
  scheduled: boolean;
}

const textAt = (value: object, key: string): string => {
  const field: unknown = Reflect.get(value, key);
  return typeof field === 'string' ? field : '';
};

// Хеш скрипта: ядро секций (блок 5) записывает его в поле script, каркас — в адрес файла (поле src).
const SCRIPT_HASH = /^[0-9a-f]{64}$/;
const scriptOf = (detail: object): string | undefined => {
  const script = textAt(detail, 'script');
  return SCRIPT_HASH.test(script) ? script : SCRIPT_FILE.exec(textAt(detail, 'src'))?.[1];
};

// Запись из события сбоя. Событие может прислать и чужой скрипт страницы, поэтому поля проверяются. Без отпечатка
// скрипта или с чужой стадией — null: такую запись не по чему найти в реестре секций.
export function recordOf(detail: unknown): ErrorRecord | null {
  if (typeof detail !== 'object' || detail === null) return null;
  const script = scriptOf(detail);
  const section = textAt(detail, 'section');
  const stage = textAt(detail, 'stage');
  if (script === undefined || section === '' || !STAGES.includes(stage)) return null;
  return { section, script, stage, message: textAt(detail, 'message').slice(0, MAX_MESSAGE_LENGTH) };
}

const keyOf = (record: ErrorRecord): string =>
  JSON.stringify([record.section, record.script, record.stage, record.message]);

function flush(deps: ErrorLogDeps, state: LogState): void {
  state.scheduled = false;
  if (state.pending.length === 0) return;
  const errors = state.pending.splice(0);
  deps.send(deps.url, JSON.stringify({ v: ERROR_LOG_VERSION, shopId: deps.shopId, errors }));
}

// На страницу — не больше MAX_RECORDS разных записей; повтор той же записи не шлётся.
function collect(deps: ErrorLogDeps, state: LogState, record: ErrorRecord | null): void {
  if (record === null || state.seen.size >= MAX_RECORDS || state.seen.has(keyOf(record))) return;
  state.seen.add(keyOf(record));
  state.pending.push(record);
  if (state.scheduled) return;
  state.scheduled = true;
  deps.later(() => flush(deps, state), FLUSH_DELAY_MS);
}

export function listenSectionErrors(deps: ErrorLogDeps): void {
  const state: LogState = { seen: new Set(), pending: [], scheduled: false };
  const onFailure = (event: Event): void => {
    if (event instanceof CustomEvent) collect(deps, state, recordOf(event.detail));
  };
  const onVisibility = (): void => {
    if (deps.document.visibilityState === 'hidden') flush(deps, state);
  };
  deps.target.addEventListener(deps.event ?? SECTION_ERROR_EVENT, onFailure, { signal: deps.signal });
  deps.document.addEventListener('visibilitychange', onVisibility, { signal: deps.signal });
}

// Откуда брать события сбоя: каркас шлёт merfy:section-error на окно, ядро секций (блок 5) — merfy:section:error на
// документ.
export interface ErrorSource {
  target: 'window' | 'document';
  event: string;
}
const SHELL_ERRORS: ErrorSource = { target: 'window', event: SECTION_ERROR_EVENT };
export const CORE_ERRORS: ErrorSource = { target: 'document', event: SECTION_FAILURE_EVENT };

// Ядро на витрине: окно, конфиг магазина и сигнал остановки ядра. Адрес — <api.url>/storefront/section-errors.
export function watchSectionErrors(
  win: Window,
  config: StorefrontConfig,
  signal: AbortSignal,
  source: ErrorSource = SHELL_ERRORS,
): void {
  listenSectionErrors({
    target: source.target === 'window' ? win : win.document,
    event: source.event,
    document: win.document,
    send: (url, body) => void win.navigator.sendBeacon(url, body),
    later: (run, ms) => void win.setTimeout(run, ms),
    url: `${config.api.url}${ERROR_LOG_PATH}`,
    shopId: config.shop.id,
    signal,
  });
}
