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
}

export interface CheckerSettings {
  rabbitmqUrl: string;
  port: number;
}

const envSchema = z.object({
  RABBITMQ_URL: z.string().min(1),
  PORT: z.coerce.number().int().positive().default(8080),
});

export function readCheckerSettings(env: NodeJS.ProcessEnv): CheckerSettings {
  const value = parseWith(envSchema, env, 'settings-invalid', 'env');
  return { rabbitmqUrl: value.RABBITMQ_URL, port: value.PORT };
}

// «После» — отличия от «до» и вердикт; «до» — только паспорт.
function compared(job: CheckJob, collected: Collected, rules: FieldRule[]) {
  if (job.phase === 'before') return { differences: [], verdict: null };
  const differences = comparePassports(normalizePassport(job.before), collected.passport, rules);
  return { differences, verdict: verdictOf(differences) };
}

export async function checkShop(deps: CheckerDeps, job: CheckJob): Promise<CheckResult> {
  const base = { v: 1 as const, release: job.release, siteId: job.siteId, phase: job.phase };
  const fields = { release: job.release, shopId: job.siteId, phase: job.phase };
  try {
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
