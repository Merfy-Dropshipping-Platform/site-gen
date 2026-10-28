// Снимок черновика: сколько экранов снимать и как уложить снимки в размер ответа (перенесено 28.10 из merfy-mcp
// `src/nova/look-fit.ts`; поправки только под линтер пакета — без `!`).
//
// Размер считается по base64 — так картинки едут в ответе брокера и дальше клиенту. Предел ~1,5 МБ (Т1, IMPECCABLE.md):
// ответ MCP с картинками тяжелее клиент уже режет сам, причём молча.
import type { LookDevice, PageSession } from './look-types';

// Предел веса всех картинок в base64, байт.
export const BUDGET_BYTES = 1_500_000;

// Сколько экранов одной страницы снимаем при `full`: дальше вес и время растут, а польза нет.
export const MAX_FULL_SCREENS = 12;

// Качество JPEG от лучшего к худшему: следующее берём, пока снимки не влезли в предел.
export const QUALITY_STEPS = [80, 62, 45, 30] as const;

export interface DeviceShots {
  device: LookDevice;
  // Экранов в странице всего.
  total: number;
  // Снятые экраны подряд с первого.
  shots: Uint8Array[];
}

export const screensIn = (pageHeight: number, viewportHeight: number): number =>
  Math.max(1, Math.ceil(pageHeight / viewportHeight));

export const plannedScreens = (total: number, full: boolean): number => (full ? Math.min(total, MAX_FULL_SCREENS) : 1);

export const base64Size = (bytes: number): number => Math.ceil(bytes / 3) * 4;

const weightOf = (groups: Uint8Array[][]): number =>
  groups.reduce((sum, group) => sum + group.reduce((inner, shot) => inner + base64Size(shot.length), 0), 0);

async function shootRange(session: PageSession, count: number, quality: number): Promise<Uint8Array[]> {
  const shots: Uint8Array[] = [];
  for (let index = 0; index < count; index += 1) shots.push(await session.shoot(index, quality));
  return shots;
}

// Кого урезать: у кого экранов больше, при равенстве — у кого они тяжелее.
function trimTarget(groups: Uint8Array[][]): number {
  const better = (candidate: Uint8Array[], best: Uint8Array[]): boolean =>
    candidate.length > best.length || (candidate.length === best.length && weightOf([candidate]) > weightOf([best]));
  return groups.reduce((best, group, index) => (better(group, groups[best] ?? []) ? index : best), 0);
}

// Убирает последние экраны у того, где их больше всего, пока не влезет; по одному экрану остаётся у каждого.
export function trimToBudget(groups: Uint8Array[][], budget: number): Uint8Array[][] {
  const kept = groups.map((group) => [...group]);
  while (weightOf(kept) > budget) {
    const target = kept[trimTarget(kept)] ?? [];
    if (target.length <= 1) break;
    target.pop();
  }
  return kept;
}

// Снимает нужные экраны и подбирает качество: сначала лучшее, при перевесе — следующее. Не влезло и на худшем — убирает
// хвостовые экраны (`trimToBudget`). Устройства снимаются одновременно, экраны одной страницы — по порядку.
export async function fitShots(
  sessions: PageSession[],
  full: boolean,
  budget: number = BUDGET_BYTES,
): Promise<DeviceShots[]> {
  const totals = sessions.map((session) => screensIn(session.facts.pageHeight, session.viewport.height));
  const counts = totals.map((total) => plannedScreens(total, full));

  let groups: Uint8Array[][] = [];
  for (const quality of QUALITY_STEPS) {
    groups = await Promise.all(sessions.map((session, index) => shootRange(session, counts[index] ?? 1, quality)));
    if (weightOf(groups) <= budget) break;
  }
  const fitted = trimToBudget(groups, budget);
  return sessions.map((session, index) => ({
    device: session.device,
    total: totals[index] ?? 1,
    shots: fitted[index] ?? [],
  }));
}
