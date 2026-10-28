import { comparePassports, normalizePassport, verdictOf, type Collected, type FieldRule } from '@merfy/stand-check';
import { z } from 'zod';
import type { Broker } from '../broker';
import { errorText } from '../errors';
import type { Log } from '../log';
import { parseWith } from '../parse';
import { CHECKS_QUEUE, parseCheckJob, type CheckJob, type CheckResult } from '../release/checks';

// Проверяющий процесс выпуска (design.md блока 10, «Автостоп и журнал выпуска»): паспорт главной магазина в браузере,
// по одному магазину. «До» — снять; «после» — снять и сравнить с «до» того же магазина по правилам выпуска
// (release-rules.json пакета stand-check: красное — только поломка). Страница не открылась — ошибка в ответе, а не
// исключение: что она значит, решает ведущий волн (до обновления — пропуск, после — поломка).

export interface CheckerDeps {
  open: (url: string) => Promise<Collected>;
  rules: FieldRule[];
  log: Log;
  // Ожидание новой сборки раздачи (гонка выпуска №77, 26.10): опрос ETag главной, пока не совпадёт с отпечатком файла
  // главной из манифеста живой сборки. По событию — совпадением, не таймером; предел — сбой раздачи.
  fetch: (url: string) => Promise<Response>;
  homePollMs: number;
  homeWaitMs: number;
}

export interface CheckerSettings {
  rabbitmqUrl: string;
  port: number;
  // Адрес sites внутри сети для снимков черновика (28.10). Нет — снимки выключены, проверки выпуска работают как раньше.
  sitesUrl: string | null;
}

const envSchema = z.object({
  RABBITMQ_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8080),
  SITES_SERVICE_URL: z.url({ protocol: /^https?$/ }).optional(),
});

export function readCheckerSettings(env: NodeJS.ProcessEnv): CheckerSettings {
  const value = parseWith(envSchema, env, 'settings-invalid', 'env');
  return { rabbitmqUrl: value.RABBITMQ_URL, port: value.PORT, sitesUrl: value.SITES_SERVICE_URL ?? null };
}

// «После» — отличия от «до» и вердикт; «до» — только паспорт.
function compared(job: CheckJob, collected: Collected, rules: FieldRule[]) {
  if (job.phase === 'before') return { differences: [], verdict: null };
  const differences = comparePassports(normalizePassport(job.before), collected.passport, rules);
  return { differences, verdict: verdictOf(differences) };
}

// Паспорт снимается с главной, а pageerror страницы оформления на главной не видны: выпуск nova 0.7.1 (№69) дал ~20
// ошибок «window.__merfyRoot is not a function» на /checkout при вердикте clean. Открываем и /checkout той же
// функцией open; её ошибки (консоль и pageerror) добавляем в паспорт главной — правило «errors added → red» их
// ловит. Страница оформления не открылась или ушла редиректом (вход покупателя — page в паспорте не /checkout) —
// ошибки не считаем: отличий из ничего не делаем.
export async function openWithCheckout(open: (url: string) => Promise<Collected>, url: string): Promise<Collected> {
  const home = await open(url);
  const checkout = await open(new URL('/checkout', url).toString()).then(
    (found) => found,
    () => null,
  );
  if (checkout === null || checkout.passport.page !== '/checkout') return home;
  const passport = normalizePassport({
    ...home.passport,
    errors: [...home.passport.errors, ...checkout.passport.errors],
  });
  return { ...home, passport };
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

// Паспорт «после» снимается только с новой сборки: раздача кэширует указатель ~1 с, и паспорт со старого HTML ловит
// 404 бандлов, которых уже нет в новой таблице раздачи, — это становилось «новой ошибкой в консоли» и красным (№77).
// Событие — ETag главной совпал с отпечатком файла главной из манифеста живой сборки. Предел истёк — сбой раздачи.
async function homeWaitProblem(deps: CheckerDeps, job: CheckJob): Promise<string | null> {
  if (job.phase !== 'after' || job.expected === undefined) return null;
  const wanted = `"${job.expected.home}"`;
  const deadline = Date.now() + deps.homeWaitMs;
  for (;;) {
    const response = await deps.fetch(`${job.url}/`).catch(() => null);
    const etag = response?.headers.get('etag') ?? null;
    if (response !== null && response.status === 200 && etag === wanted) return null;
    if (Date.now() + deps.homePollMs >= deadline) {
      const seconds = Math.round(deps.homeWaitMs / 1000);
      return `раздача не сменила главную на новую сборку за ${seconds} с: ETag ${etag ?? 'нет'}, ждали ${wanted}`;
    }
    await wait(deps.homePollMs);
  }
}

export async function checkShop(deps: CheckerDeps, job: CheckJob): Promise<CheckResult> {
  const base = { v: 1 as const, release: job.release, siteId: job.siteId, phase: job.phase };
  const fields = { release: job.release, shopId: job.siteId, phase: job.phase };
  try {
    const stale = await homeWaitProblem(deps, job);
    if (stale !== null) throw new Error(stale);
    const collected = await deps.open(job.url);
    const { differences, verdict } = compared(job, collected, deps.rules);
    deps.log('check-done', { ...fields, verdict, differences: differences.length });
    return { ...base, passport: collected.passport, verdict, differences, error: null };
  } catch (error) {
    deps.log('check-failed', { ...fields, error: errorText(error) });
    return { ...base, passport: null, verdict: null, differences: [], error: errorText(error) };
  }
}

// Задания — по одному (prefetch 1): браузер на одно задание, память процесса не растёт с очередью.
export async function startChecker(
  broker: Pick<Broker, 'consume' | 'publishCheckResult'>,
  deps: CheckerDeps,
): Promise<void> {
  await broker.consume(CHECKS_QUEUE, 1, async ({ body }) => {
    await broker.publishCheckResult(await checkShop(deps, parseCheckJob(body)));
  });
}
