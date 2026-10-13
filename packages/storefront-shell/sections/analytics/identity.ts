import type { Identity } from './consent.ts';
import type { KeyValue } from './storage.ts';

// Визит и посетитель (design.md блока 11, решил сам 9). Имена, сроки и атрибуты меток — как у нынешнего трекера:
// _mfy_vid на год, _mfy_sid на 30 минут, path=/, SameSite=Lax; ставятся только при согласии (С11-2 В). До ответа визит
// живёт в sessionStorage: с запросами на сервер он не уходит и после закрытия вкладки не остаётся; его номер идёт и в
// session_id, и в visitor_id — без visitor_id кабинет посетителя не считает. Метка на год, когда её впервые можно
// поставить, получает номер текущего визита: визит до и после «принять» — один посетитель.
export const VISITOR_COOKIE = '_mfy_vid';
export const SESSION_COOKIE = '_mfy_sid';
export const VISIT_KEY = 'merfy:analytics:visit';
export const VISIT_MS = 30 * 60_000;
export const VISITOR_MS = 365 * 86_400_000;
const VISIT_SEPARATOR = '|';
const COOKIE_TAIL = ';path=/;SameSite=Lax';

export interface Cookies {
  read: () => string;
  write: (cookie: string) => void;
}

export interface IdentityEnv {
  cookies: Cookies;
  session: KeyValue;
  now: () => number;
  newId: () => string;
}

export interface Ids {
  sessionId: string;
  visitorId: string;
  // Визит начался с этим событием: перед ним уходит session_start.
  started: boolean;
}

function cookieValue(cookies: Cookies, name: string): string | null {
  const pair = cookies
    .read()
    .split('; ')
    .find((item) => item.startsWith(`${name}=`));
  const value = pair?.slice(name.length + 1) ?? '';
  return value === '' ? null : value;
}

function writeCookie(env: IdentityEnv, name: string, value: string, lifetimeMs: number): void {
  env.cookies.write(`${name}=${value};expires=${new Date(env.now() + lifetimeMs).toUTCString()}${COOKIE_TAIL}`);
}

// Визит из sessionStorage: «номер|время последнего события»; старше 30 минут — визита нет.
function liveVisit(env: IdentityEnv): string | null {
  const [id = '', at = ''] = (env.session.getItem(VISIT_KEY) ?? '').split(VISIT_SEPARATOR);
  return id !== '' && env.now() - Number(at) < VISIT_MS ? id : null;
}

function touchVisit(env: IdentityEnv, id: string): void {
  env.session.setItem(VISIT_KEY, `${id}${VISIT_SEPARATOR}${env.now()}`);
}

function visitIds(env: IdentityEnv): Ids {
  const live = liveVisit(env);
  const id = live ?? env.newId();
  touchVisit(env, id);
  return { sessionId: id, visitorId: id, started: live === null };
}

function visitorIds(env: IdentityEnv): Ids {
  const live = cookieValue(env.cookies, SESSION_COOKIE) ?? liveVisit(env);
  const sessionId = live ?? env.newId();
  const visitor = cookieValue(env.cookies, VISITOR_COOKIE);
  if (visitor === null) writeCookie(env, VISITOR_COOKIE, sessionId, VISITOR_MS);
  writeCookie(env, SESSION_COOKIE, sessionId, VISIT_MS);
  touchVisit(env, sessionId);
  return { sessionId, visitorId: visitor ?? sessionId, started: live === null };
}

const IDS_BY_IDENTITY: Readonly<Record<Identity, ((env: IdentityEnv) => Ids) | null>> = {
  none: null,
  visit: visitIds,
  visitor: visitorIds,
};

// Номера для события по правилу согласия; none — номеров нет: событие не уходит, ничего не пишется.
export function idsFor(identity: Identity, env: IdentityEnv): Ids | null {
  return IDS_BY_IDENTITY[identity]?.(env) ?? null;
}
