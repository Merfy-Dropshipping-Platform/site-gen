import { panelForTheme, parsePanel, type Dictionary, type PanelSchema } from '@merfy/tokens';

// Две панели темы (блок 3 «Секций и SDK», часть 3в; design.md блока 3, 3.7). panel — то, что тема показывает мерчанту в
// «Настройках темы»: поля из theme.json → panel.hidden убраны. platformPanel — полная панель платформы со словарём этой
// темы, скрытые темой поля на месте: по ней считаются значения настроек для секций, скрытое поле приходит с умолчанием.
export interface ThemePanels {
  panel: PanelSchema;
  platformPanel: PanelSchema;
}

export function themePanels(platformRaw: unknown, dictionary: Dictionary, themePanel: unknown): ThemePanels {
  const platformPanel = parsePanel(platformRaw, dictionary);
  return { panel: panelForTheme(platformPanel, themePanel), platformPanel };
}
