import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { platformDictionary } from '../src/dictionary';
import { settingFields, tokenFields } from '../src/panel/fields';
import { parsePanel } from '../src/panel/panel';

// Группа «Баннер» панели платформы после блока 12 «Секций и SDK»: заголовок, текст, кнопки и положение баннера — поля его
// секции; в панели темы остаются «Баннер cookie» и «Цветовая схема».
const PANEL_URL = new URL('../../theme-contract/panel/theme-panel.json', import.meta.url);
const panel = parsePanel(JSON.parse(readFileSync(PANEL_URL, 'utf8')), platformDictionary);
const MOVED = [
  'cookie-banner-title',
  'cookie-banner-text',
  'cookie-banner-primary-label',
  'cookie-banner-secondary-label',
  'cookie-banner-position',
];

describe('группа «Баннер» панели платформы', () => {
  it('в группе — «Баннер cookie» и «Цветовая схема»; правого сайдбара нет ни у одной группы', () => {
    const banner = panel.groups.find((group) => group.id === 'banner');
    expect(banner?.fields.map((field) => field.id)).toEqual(['cookie-banner-enabled', 'cookie-banner-scheme']);
    expect(panel.groups.filter((group) => group.sidebar)).toEqual([]);
  });

  it('пять полей текстов и положения убраны: их нет ни среди настроек, ни среди токенов', () => {
    const ids = [...settingFields(panel).map((field) => field.id), ...tokenFields(panel).map((field) => field.id)];
    for (const id of MOVED) expect(ids).not.toContain(id);
  });

  it('схема баннера видна, пока включён «Баннер cookie»', () => {
    const scheme = tokenFields(panel).find((field) => field.id === 'cookie-banner-scheme');
    expect(scheme?.visibleWhen).toEqual({ setting: 'cookie-banner-enabled', equals: true });
  });
});
