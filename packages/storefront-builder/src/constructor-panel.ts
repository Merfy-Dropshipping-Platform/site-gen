import { isSettingField, type PanelField, type PanelGroup, type PanelSchema } from '@merfy/tokens';

// Панель «Настроек темы» для конструктора (блок 3 «Секций и SDK», Р3.3) — без пометки сквозных настроек. Конструктор
// разбирает панель своим @merfy/tokens 0.1.0: у него строгая форма поля без ключа shared, и панель с этим ключом он
// отклонил бы целиком. Пометка нужна только проверке секций в site-gen; понадобится конструктору — новый выпуск токенов.
function withoutShared(field: PanelField): PanelField {
  if (!isSettingField(field)) return field;
  const { shared, ...rest } = field;
  return shared === undefined ? field : rest;
}

function groupWithoutShared(group: PanelGroup): PanelGroup {
  const fields = group.fields.map(withoutShared);
  if (group.sidebar === undefined) return { ...group, fields };
  return { ...group, fields, sidebar: { ...group.sidebar, fields: group.sidebar.fields.map(withoutShared) } };
}

export const panelForConstructor = (panel: PanelSchema): PanelSchema => ({
  ...panel,
  groups: panel.groups.map(groupWithoutShared),
});
