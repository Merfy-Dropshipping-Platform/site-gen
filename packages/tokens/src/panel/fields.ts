import type { PanelField, PanelGroup, PanelSchema, SettingField, SettingsEdits, TokenField } from './types';

// Поля панели одним списком: группы по порядку, у группы — её поля, потом поля её правого сайдбара.

export const isTokenField = (field: PanelField): field is TokenField => 'token' in field;
export const isSettingField = (field: PanelField): field is SettingField => 'setting' in field;

export const groupFields = (group: PanelGroup): PanelField[] => [...group.fields, ...(group.sidebar?.fields ?? [])];

export const panelFields = (panel: PanelSchema): PanelField[] => panel.groups.flatMap(groupFields);
export const tokenFields = (panel: PanelSchema): TokenField[] => panelFields(panel).filter(isTokenField);
export const settingFields = (panel: PanelSchema): SettingField[] => panelFields(panel).filter(isSettingField);

// Поле видно при этих настройках? Условия нет — видно всегда. settings — все настройки (resolveSettings).
export const fieldVisible = (field: PanelField, settings: Readonly<SettingsEdits>): boolean =>
  field.visibleWhen === undefined || settings[field.visibleWhen.setting] === field.visibleWhen.equals;
