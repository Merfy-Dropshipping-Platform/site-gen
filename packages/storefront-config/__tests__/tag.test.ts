import { describe, expect, it } from 'vitest';
import { inlineScriptJson } from '../../../src/common/inline-script-json';
import { CONFIG_TAG_ID, configTag, escapeScriptJson } from '../src/tag';
import type { StorefrontConfig } from '../src/schema';
import { standConfig } from './support';

const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);
const OPEN = '<script type="application/json" id="merfy-config">';
const CLOSE = '</script>';

const withShopName = (name: string): StorefrontConfig => ({ ...standConfig, shop: { ...standConfig.shop, name } });

// Текст между открывающим и закрывающим тегом.
const tagContent = (tag: string): string => tag.slice(OPEN.length, -CLOSE.length);

describe('configTag', () => {
  it('тег — <script type="application/json" id="merfy-config"> с JSON конфига', () => {
    const tag = configTag(standConfig);
    expect(CONFIG_TAG_ID).toBe('merfy-config');
    expect(tag.startsWith(OPEN)).toBe(true);
    expect(tag.endsWith(CLOSE)).toBe(true);
    expect(JSON.parse(tagContent(tag))).toEqual(standConfig);
  });

  it.each(['</script><script>alert(1)</script>', '<!--', '<!-- </script> -->', 'Лавка <b>«У Тани»</b>'])(
    'имя магазина %s не закрывает тег: внутри нет ни одного «<»',
    (name) => {
      const tag = configTag(withShopName(name));
      expect(tag.indexOf(CLOSE)).toBe(tag.length - CLOSE.length);
      expect(tagContent(tag)).not.toContain('<');
    },
  );

  it('тег разбирается обратно в тот же объект — с «<», U+2028 и U+2029 в имени', () => {
    const config = withShopName(`Лавка </script> <!-- ${LINE_SEPARATOR}${PARAGRAPH_SEPARATOR}`);
    expect(JSON.parse(tagContent(configTag(config)))).toEqual(config);
  });
});

describe('escapeScriptJson — по правилам inlineScriptJson публикации', () => {
  it.each<[string, unknown]>([
    ['конфиг стенда', standConfig],
    ['закрывающий тег', '</script><script>alert(1)</script>'],
    ['комментарий HTML', '<!-- x -->'],
    ['U+2028 и U+2029', `a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c`],
    ['всё вместе в объекте', { name: `</SCRIPT>${LINE_SEPARATOR}`, list: ['<', PARAGRAPH_SEPARATOR] }],
    ['кавычки и обратная косая', 'a "b" \\ c'],
    ['без особых символов', { a: 1, b: [true, null] }],
  ])('%s — вывод совпадает с inlineScriptJson', (_title, value) => {
    expect(escapeScriptJson(JSON.stringify(value))).toBe(inlineScriptJson(value));
  });

  it('U+2028 и U+2029 — последовательностями, а не самими символами', () => {
    const escaped = escapeScriptJson(JSON.stringify(`a${LINE_SEPARATOR}b${PARAGRAPH_SEPARATOR}c`));
    expect(escaped).toBe('"a\\u2028b\\u2029c"');
    expect(escaped).not.toContain(LINE_SEPARATOR);
    expect(escaped).not.toContain(PARAGRAPH_SEPARATOR);
  });
});
