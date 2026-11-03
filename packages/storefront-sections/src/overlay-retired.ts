import type { DoorFields } from './doors';
import { MANIFEST_FILE, isOverlaySection, type SectionManifest } from './format';
import { problem, type SectionProblem } from './problems';
import { hasOverlayWindow, type RowsQuery } from './registry';

// Три блока (03.11, решение продакта и владельца): в конструкторе только Шапка, Тема и Подвал, отдельный блок «Поверх
// страницы» — ядро, и мерчант его не создаёт. Новая секция без роли не объявляет группу overlay; окно над экраном секция
// из шапки, темы или подвала показывает поведением dialog из скрипта (ctx.behavior). Секции, принятые с overlay раньше
// (окно, 01.11), работают как работали: их новая правка группу сохраняет, экземпляры в ревизиях не трогаются.
export const OVERLAY_RETIRED_TEXT =
  'groups: группу overlay новая секция не объявляет — в конструкторе три блока: шапка, тема и подвал. ' +
  'Поставь секцию в header, page или footer ("groups": ["page"]), а окно над экраном покажи поведением dialog: ' +
  'ctx.behavior("dialog").open() из скрипта секции (script.md#поведения-из-скрипта-секции)';

export async function overlayRetiredProblems(
  db: RowsQuery,
  door: DoorFields,
  manifest: SectionManifest,
): Promise<SectionProblem[]> {
  if (!isOverlaySection(manifest)) return [];
  if (await hasOverlayWindow(db, door, `${door.prefix}:${manifest.name}`)) return [];
  return [problem('overlay-retired', MANIFEST_FILE, OVERLAY_RETIRED_TEXT)];
}
