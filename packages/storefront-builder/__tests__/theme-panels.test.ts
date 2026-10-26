import { readFileSync } from 'node:fs';
import { platformDictionary, settingFields } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { themePanels, type ThemePanels } from '../src/theme-panels';

// Панель темы и полная панель платформы (блок 3 «Секций и SDK», часть 3в, design.md блока 3, 3.7).
const PANEL_URL = new URL('../../theme-contract/panel/theme-panel.json', import.meta.url);
const platformRaw: unknown = JSON.parse(readFileSync(PANEL_URL, 'utf8'));
const idsOf = (panel: ThemePanels['panel']): string[] => settingFields(panel).map((field) => field.id);

describe('панели темы: показанная мерчанту и полная', () => {
  it('тема ничего не скрывает — в обеих панелях одни и те же 10 настроек', () => {
    const { panel, platformPanel } = themePanels(platformRaw, platformDictionary, undefined);
    expect(idsOf(panel)).toEqual(idsOf(platformPanel));
    expect(idsOf(platformPanel)).toHaveLength(10);
  });

  it('тема скрыла поля — из показанной панели они убраны, из полной нет', () => {
    const hidden = ['cart-type', 'social-telegram'];
    const { panel, platformPanel } = themePanels(platformRaw, platformDictionary, { hidden });
    expect(idsOf(panel)).toHaveLength(8);
    expect(idsOf(panel)).not.toEqual(expect.arrayContaining(hidden));
    expect(idsOf(platformPanel)).toEqual(expect.arrayContaining(hidden));
  });

  it('скрыто поле, которого в панели нет — panel-invalid, как раньше', () => {
    expect(() => themePanels(platformRaw, platformDictionary, { hidden: ['no-such-field'] })).toThrow(/no-such-field/);
  });
});
