/**
 * Писатель «прочитал текущую ревизию → посчитал новую → записал с базой»
 * (страницы кабинета, сброс контент-страниц). Его правка — функция от
 * состояния магазина, поэтому при споре её безопаснее ПЕРЕСЧИТАТЬ от свежей
 * ревизии, чем перезаписать чужое: `attempt` целиком (чтение, расчёт,
 * запись) повторяется, если запись упёрлась в чужую правку того же места
 * (`RevisionMergeConflictError`).
 *
 * Гонку CAS здесь не повторяем: её отрабатывает сам порт (свежий указатель и
 * слияние поверх, `save-on-base.ts`). Проиграл все свои попытки —
 * `RevisionConflictError` уходит наружу сразу, иначе попытки перемножались бы
 * (3 × 3). Правки в разных местах сливает сам порт. Карта модуля — `README.md`.
 */
import { RevisionMergeConflictError } from "./store-content.port";

/** Пересчётов правки от свежей ревизии. */
export const REWRITE_ATTEMPTS = 3;

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
    const needsRecount = outcome.error instanceof RevisionMergeConflictError;
    if (tried >= REWRITE_ATTEMPTS || !needsRecount) throw outcome.error;
  }
}
