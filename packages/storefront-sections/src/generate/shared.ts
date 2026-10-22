import { parsePanel, platformDictionary, sharedSettings } from '@merfy/tokens';
import type { SharedSettingName } from '../names';

// Список сквозных настроек (блок 3 «Секций и SDK», Р3.4): поля панели темы с пометкой shared, по порядку панели.
// src панель не импортирует: сырой JSON читает scripts/generate.ts.
export function sharedSettingsOf(panelRaw: unknown): SharedSettingName[] {
  const panel = parsePanel(panelRaw, platformDictionary);
  return sharedSettings(panel).map(({ group, field }) => ({ id: field.id, label: field.label, group }));
}
