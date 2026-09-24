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

export async function rewriteCurrent<T>(attempt: () => Promise<T>): Promise<T> {
  for (let tried = 1; ; tried += 1) {
    try {
      return await attempt();
    } catch (e) {
      if (tried >= ATTEMPTS || !isStaleWrite(e)) throw e;
    }
  }
}
