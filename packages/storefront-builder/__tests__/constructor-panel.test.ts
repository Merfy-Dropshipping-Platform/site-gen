import { readFileSync } from 'node:fs';
import { parsePanel, platformDictionary, sharedSettings } from '@merfy/tokens';
import { describe, expect, it } from 'vitest';
import { panelForConstructor } from '../src/constructor-panel';

// Конструктор разбирает панель своим @merfy/tokens 0.1.0 — строгая форма поля без shared (блок 3 «Секций и SDK», Р3.3).
const PANEL_URL = new URL('../../theme-contract/panel/theme-panel.json', import.meta.url);
const raw: unknown = JSON.parse(readFileSync(PANEL_URL, 'utf8'));
const panel = parsePanel(raw, platformDictionary);
const withoutSharedKey = (text: string): unknown =>
  JSON.parse(text, (key, value: unknown) => (key === 'shared' ? undefined : value));

describe('панель «Настроек темы» для конструктора', () => {
  it('в панели платформы 10 сквозных', () => {
    expect(sharedSettings(panel)).toHaveLength(10);
  });

  it('в ответе конструктору ключа shared нет, остальное — как в панели', () => {
    const answer = JSON.stringify(panelForConstructor(panel));
    const parsed: unknown = JSON.parse(answer);
    expect(answer).not.toContain('"shared"');
    expect(parsed).toEqual(withoutSharedKey(JSON.stringify(panel)));
  });

  it('панель сборщика не меняется', () => {
    panelForConstructor(panel);
    expect(sharedSettings(panel)).toHaveLength(10);
  });
});
