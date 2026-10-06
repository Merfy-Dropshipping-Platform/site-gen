import { requiredEnv, type Env } from './targets';

export type BuyerCredentials = { email: string; password: string };

// Покупатель тестового магазина на dev (Э2-2 В): почта и пароль — только из окружения. В файлы, отчёт и тексты
// ошибок не попадают: ошибка называет переменную, а не значение. Вход покупателя придёт с кнопками SDK
// (задачи 4–6 этапа).
const BUYER_EMAIL = 'STAND_BUYER_EMAIL';
const BUYER_PASSWORD = 'STAND_BUYER_PASSWORD';

export const buyerCredentials = (env: Env): BuyerCredentials => ({
  email: requiredEnv(env, BUYER_EMAIL),
  password: requiredEnv(env, BUYER_PASSWORD),
});
