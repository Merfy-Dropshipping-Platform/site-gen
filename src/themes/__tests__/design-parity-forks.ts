import { execFileSync } from "node:child_process";
import { resolve } from "node:path";

/**
 * Есть ли у темы ещё развилка «как у верстальщиков / прежний вид».
 *
 * Владелец 25.09: «одна версия секции» — темы по одной избавляются от
 * развилки (признак `__designParity` в порте и пакете темы). У темы без неё
 * проверки «прежней ветки» не имеют смысла, а признак не должен менять
 * ничего. Считаем по исходникам порта и пакета темы, без тестов.
 */
export function themeReadsDesignParity(theme: string): boolean {
  try {
    const out = execFileSync(
      "git",
      [
        "grep",
        "-l",
        "__designParity",
        "--",
        `themes/${theme}/src`,
        `packages/theme-${theme}`,
        ":(exclude)**/__tests__/**",
      ],
      { cwd: resolve(__dirname, "..", "..", ".."), encoding: "utf8" },
    );
    return out.trim().length > 0;
  } catch {
    // git grep без совпадений завершается кодом 1 — развилки нет.
    return false;
  }
}
