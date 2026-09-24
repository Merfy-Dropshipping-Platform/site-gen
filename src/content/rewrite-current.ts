/**
 * Писатель «прочитал текущую ревизию → посчитал новую → записал с базой»
 * (страницы кабинета, сброс контент-страниц). Его правка — функция от
 * состояния магазина, поэтому при споре её безопаснее ПЕРЕСЧИТАТЬ от свежей
 * ревизии, чем перезаписать чужое: `attempt` целиком (чтение, расчёт,
 * запись) повторяется, если запись упёрлась в чужую правку того же места
 * (`RevisionMergeConflictError`) или проиграла все попытки CAS
 * (`revision_conflict`). Правки в разных местах сливает сам порт.
 */
import { RevisionMergeConflictError } from "./store-content.port";

const ATTEMPTS = 3;

function isStaleWrite(e: unknown): boolean {
  if (e instanceof RevisionMergeConflictError) return true;
  return e instanceof Error && e.message === "revision_conflict";
}

type Outcome<T> = { ok: true; value: T } | { ok: false; error: unknown };

function settle<T>(attempt: () => Promise<T>): Promise<Outcome<T>> {
  return attempt().then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

export async function rewriteCurrent<T>(attempt: () => Promise<T>): Promise<T> {
  for (let tried = 1; ; tried += 1) {
    const outcome = await settle(attempt);
    if (outcome.ok) return outcome.value;
    if (tried >= ATTEMPTS || !isStaleWrite(outcome.error)) throw outcome.error;
  }
}
