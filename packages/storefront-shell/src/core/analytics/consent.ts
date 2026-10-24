import type { KeyValue } from './storage.ts';

// Согласие на cookie (design.md блока 11, С11-2 В; блок 13 «Секций и SDK», 13.2). Ответ баннера — там же, где у баннера
// пяти тем: localStorage['merfy:cookie-consent:v1'], дата — принял, «declined:<дата>» — отклонил, ключа нет — не
// ответил. Пишет ответ часть consent ядра (src/core/parts/consent.ts), читают она и модуль аналитики.
export const CONSENT_KEY = 'merfy:cookie-consent:v1';
const DECLINED_PREFIX = 'declined:';

export type ConsentState = 'unknown' | 'accepted' | 'declined';
// none — ничего не отправлять; visit — обезличенный визит без метки на год (sessionStorage); visitor — метки _mfy_vid
// и _mfy_sid, как у нынешнего трекера.
export type Identity = 'none' | 'visit' | 'visitor';

export interface ConsentRule {
  identity: Identity;
  // Счётчики мерчанта (Метрика, VK, Google) можно грузить.
  counters: boolean;
  // «Свой код» с отметкой «Ждать согласия на cookie» можно запускать; код с «Запускать сразу» идёт при любом ответе.
  custom: boolean;
}

// Одна таблица «ответ → что можно» (С11-2 В, блок 13). Скрипты расширений работают при любом ответе — столбца нет (блок
// 12). Юрист скажет «до ответа — ничего» (С11-2 Б) — правка строки unknown на { identity: 'none', … } и теста таблицы в
// analytics-rules.test.ts; код модуля не меняется.
export const CONSENT_RULES: Readonly<Record<ConsentState, ConsentRule>> = {
  unknown: { identity: 'visit', counters: false, custom: false },
  accepted: { identity: 'visitor', counters: true, custom: true },
  declined: { identity: 'none', counters: false, custom: false },
};

export function readConsent(local: Pick<KeyValue, 'getItem'>): ConsentState {
  const answer = local.getItem(CONSENT_KEY) ?? '';
  if (answer === '') return 'unknown';
  return answer.startsWith(DECLINED_PREFIX) ? 'declined' : 'accepted';
}

// Значение ключа для ответа: дата ответа в ISO, у отказа — с префиксом.
export const storedConsent = (state: Exclude<ConsentState, 'unknown'>, at: Date): string =>
  state === 'declined' ? `${DECLINED_PREFIX}${at.toISOString()}` : at.toISOString();

export const consentRule = (local: Pick<KeyValue, 'getItem'>): ConsentRule => CONSENT_RULES[readConsent(local)];
