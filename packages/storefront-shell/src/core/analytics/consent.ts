import type { KeyValue } from './storage.ts';

// Согласие на cookie (design.md блока 11, С11-2 В; решил сам 10). Ответ баннера — там же, где у нынешнего баннера:
// localStorage['merfy:cookie-consent:v1'], дата — принял, «declined:<дата>» — отклонил, ключа нет — не ответил.
// Баннера в этапе нет; имена действий SDK «принять» и «отклонить» — договор SDK (блок 7, С7-6), шов плана.
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
}

// Одна таблица «ответ → что можно» (С11-2 В). Юрист скажет «до ответа — ничего» (С11-2 Б) — правка строки unknown на
// { identity: 'none', counters: false } и теста таблицы в analytics-rules.test.ts; код модуля не меняется.
export const CONSENT_RULES: Readonly<Record<ConsentState, ConsentRule>> = {
  unknown: { identity: 'visit', counters: false },
  accepted: { identity: 'visitor', counters: true },
  declined: { identity: 'none', counters: false },
};

export function readConsent(local: KeyValue): ConsentState {
  const answer = local.getItem(CONSENT_KEY) ?? '';
  if (answer === '') return 'unknown';
  return answer.startsWith(DECLINED_PREFIX) ? 'declined' : 'accepted';
}

export const consentRule = (local: KeyValue): ConsentRule => CONSENT_RULES[readConsent(local)];
