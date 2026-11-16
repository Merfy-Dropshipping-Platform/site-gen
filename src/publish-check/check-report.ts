/**
 * Итог проверки публикации магазина новой темы (16.11). Находка — тот же вид, что у мест проверок проверяющего
 * процесса (`packages/storefront-builder/src/checks/finding.ts`): текст уже «что не так · как починить», одинаковые в
 * секции собраны в `count`. Важность ставит проверка, последствие — публикация: находка уровня `error` закрывает
 * публикацию, `warning` — нет (семантика, решение владельца 16.11: «нормальный вариант»).
 */

/** Место проверки по её входу: код секции, HTML страницы, страница в браузере, аудит, магазин целиком, выпуск. */
export type CheckPlace =
  | "code"
  | "html"
  | "browser"
  | "audit"
  | "shop"
  | "release";
export type CheckLevel = "error" | "warning";

export interface CheckFinding {
  place: CheckPlace;
  /** Проверка: `semantic`, `marks`, `catalog`… */
  check: string;
  /** Правило внутри проверки. */
  rule: string;
  level: CheckLevel;
  /** id экземпляра секции; `null` — страница или магазин целиком. */
  section: string | null;
  /** Где словами: тег и начало текста, метка, страница. */
  where: string;
  text: string;
  count: number;
}

/** Проверка не отработала. Это не поломка магазина и публикацию не закрывает. */
export interface CheckFailure {
  place: CheckPlace;
  check: string;
  reason: string;
}

export interface PublishCheck {
  /** С какой ревизии считали изменения; `null` — проверяли весь магазин. */
  since: string | null;
  /** Проверенная ревизия — черновик в момент проверки. */
  revisionId: string;
  /** Страницы, которые сняли, по порядку. */
  pages: string[];
  findings: CheckFinding[];
  failed: CheckFailure[];
  /** Есть находка уровня `error`: публиковать нельзя (кроме `skipChecks`). */
  blocked: boolean;
}

/** Одинаковые находки секции — одна строка со счётчиком; `where` — у первой. */
export function grouped(findings: readonly CheckFinding[]): CheckFinding[] {
  const byKey = new Map<string, CheckFinding>();
  for (const finding of findings) {
    const key = [
      finding.place,
      finding.check,
      finding.rule,
      finding.section ?? "",
      finding.text,
    ].join("\u0000");
    const prev = byKey.get(key);
    if (prev) prev.count += finding.count;
    else byKey.set(key, { ...finding });
  }
  return [...byKey.values()];
}
