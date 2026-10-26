import type { StorefrontConfig } from '@merfy/storefront-config';
import { SECTION_FAILURE_EVENT } from './core/events';
import type { FailureStage } from './core/types';

// Канал ошибок секций (design.md блока 7, С7-16 А; план блока 11, часть 4). На витрине (mode: live) ядро копит записи
// merfy:section:error и шлёт их пачкой в шлюз: имя секции, хеш её скрипта, стадия и текст. По имени и хешу
// сборщик витрин находит в таблице секций автора, владельца и выпуск. Адреса страницы, браузера и данных покупателя в
// записи нет. Отправка — sendBeacon с text/plain: такой запрос браузер шлёт без предварительного OPTIONS, а CORS шлюза
// свой домен магазина не пускает; ответ шлюза никто не читает.
// Часть 15е: только событие ядра на document; событие старого каркаса и адрес его модулей убраны (13г Д).
export const ERROR_LOG_PATH = '/storefront/section-errors';
export const ERROR_LOG_VERSION = 1;
export const MAX_RECORDS = 10;
export const MAX_MESSAGE_LENGTH = 300;
export const FLUSH_DELAY_MS = 2_000;
const STAGES: readonly string[] = ['mount', 'unmount', 'runtime'] satisfies readonly FailureStage[];

export interface ErrorRecord {
  section: string;
  script: string;
  stage: string;
  message: string;
}

export interface ErrorLogDeps {
  // Документ: на нём событие сбоя ядра и уход страницы в фон (visibilitychange).
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

// Хеш скрипта: ядро секций (блок 5) записывает его в поле script.
const SCRIPT_HASH = /^[0-9a-f]{64}$/;
const scriptOf = (detail: object): string | undefined => {
  const script = textAt(detail, 'script');
  return SCRIPT_HASH.test(script) ? script : undefined;
};

// Запись из события сбоя. Событие может прислать и чужой скрипт страницы, поэтому поля проверяются. Без хеша
// скрипта или с чужой стадией — null: такую запись не по чему найти в таблице секций.
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
  deps.document.addEventListener(SECTION_FAILURE_EVENT, onFailure, { signal: deps.signal });
  deps.document.addEventListener('visibilitychange', onVisibility, { signal: deps.signal });
}

// Ядро на витрине: окно, конфиг магазина и сигнал остановки ядра. Адрес — <api.url>/storefront/section-errors.
export function watchSectionErrors(win: Window, config: StorefrontConfig, signal: AbortSignal): void {
  listenSectionErrors({
    document: win.document,
    send: (url, body) => void win.navigator.sendBeacon(url, body),
    later: (run, ms) => void win.setTimeout(run, ms),
    url: `${config.api.url}${ERROR_LOG_PATH}`,
    shopId: config.shop.id,
    signal,
  });
}
