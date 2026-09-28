/**
 * Выключатели сближения «живой сайт = конструктор» — по одному на пункт.
 *
 * Владелец 22.09: убрать расхождения между витриной и превью конструктора,
 * эталон — конструктор, по одному пункту, и так, чтобы при поломке всё
 * быстро откатить. Поэтому каждый пункт включается отдельной переменной
 * окружения и по умолчанию ВЫКЛЮЧЕН: выкладка кода сама ничего не меняет.
 *
 *   PARITY_<ПУНКТ>=*            — для всех сайтов
 *   PARITY_<ПУНКТ>=id1,id2      — только для перечисленных siteId (стенды)
 *   PARITY_<ПУНКТ>= / off / 0   — прежнее поведение
 *
 * Откат пункта — выключить переменную в Coolify и перезапустить sites;
 * откат кода и пересборка образа не нужны.
 */
export type ParityItem =
  | "TOKENS"
  | "LOGO"
  | "CHROME"
  | "FOOTER"
  | "HOT";

export function parityOn(
  item: ParityItem,
  siteId: string | null | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const raw = (env[`PARITY_${item}`] ?? "").trim();
  if (!raw || raw === "off" || raw === "0") return false;
  if (raw === "*") return true;
  if (!siteId) return false;
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(siteId);
}
