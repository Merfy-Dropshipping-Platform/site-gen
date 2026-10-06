import { StandError } from '../errors';
import { STAND_PATH } from '../stand-path.mjs';
import type { Target } from '../types';

export type Env = Readonly<Record<string, string | undefined>>;
type TargetView = { mocks: boolean; baseUrl: (env: Env) => string };

// astro preview темы nova: команда `pnpm --dir themes/nova stand` поднимает его на этом порту.
const LOCAL_URL = 'http://localhost:4321';
const DEV_URL_VARIABLE = 'STAND_DEV_URL';

export function requiredEnv(env: Env, name: string): string {
  const value = env[name];
  if (value === undefined || value === '') throw new StandError('env-missing', `нужна переменная окружения ${name}`);
  return value;
}

// Где живёт стенд (Э2-1 А, Э2-2 В): локально — preview темы и подмена ответов API;
// на dev — тестовый магазин владельца без подмен (после блоков 4–6: новую тему туда ставит новый сборщик).
export const TARGETS: Record<Target, TargetView> = {
  local: { mocks: true, baseUrl: () => LOCAL_URL },
  dev: { mocks: false, baseUrl: (env) => requiredEnv(env, DEV_URL_VARIABLE) },
};

export const standUrl = (target: Target, env: Env): string => new URL(STAND_PATH, TARGETS[target].baseUrl(env)).href;
