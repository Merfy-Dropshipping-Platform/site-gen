import type { KeyValue } from './storage.ts';

// Пометка трафика (design.md блока 11, решил сам 7) — как у нынешнего трекера (tracker.js сборщика аналитики):
// ?mfy_owner=1 — владелец смотрит свой магазин, ?mfy_owner=0 — метку снять; параметр сразу убирается из адреса.
// Браузер под управлением программы (navigator.webdriver) — робот, он важнее метки владельца. Итоговую пометку (human,
// bot, internal) ставит сборщик по подсказке traffic — правила кабинета не меняются. Метка владельца живёт в
// localStorage магазина; cookie-резерва нынешнего трекера нет (раздел «Отличия от design.md»).
export const OWNER_PARAM = 'mfy_owner';
export const OWNER_KEY = '_mfy_owner';
const OWNER_ON = '1';
const OWNER_OFF = '0';
const OWNER_VALUES: Readonly<Partial<Record<string, boolean>>> = { [OWNER_ON]: true, [OWNER_OFF]: false };

export type Traffic = 'bot' | 'internal' | null;

export interface TrafficEnv {
  location: Pick<Location, 'href'>;
  history: Pick<History, 'state' | 'replaceState'>;
  local: KeyValue;
  webdriver: boolean;
}

// Метка из адреса этой страницы: true или false; null — параметра нет или значение незнакомое (его всё равно убираем).
export function applyOwnerParam(env: TrafficEnv): boolean | null {
  const url = new URL(env.location.href);
  const value = url.searchParams.get(OWNER_PARAM);
  if (value === null) return null;
  url.searchParams.delete(OWNER_PARAM);
  env.history.replaceState(env.history.state, '', `${url.pathname}${url.search}${url.hash}`);
  const owner = OWNER_VALUES[value] ?? null;
  if (owner !== null) env.local.setItem(OWNER_KEY, owner ? OWNER_ON : OWNER_OFF);
  return owner;
}

// Подсказка сборщику на каждое событие. Метка из адреса этой страницы действует и без хранилища.
export function trafficOf(env: Pick<TrafficEnv, 'local' | 'webdriver'>, ownerThisPage: boolean | null): Traffic {
  if (env.webdriver) return 'bot';
  const owner = ownerThisPage ?? env.local.getItem(OWNER_KEY) === OWNER_ON;
  return owner ? 'internal' : null;
}
