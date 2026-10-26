import { describe, expect, it } from 'vitest';
import { bundleScript, type BundleSource } from '../src/bundle';
import { sha256 } from '../src/canonical';

// Тексты бандла страницы — UTF-8, как HTML магазина (блок 15 «Секций и SDK», часть 15ж, Р15ж-8): модуль браузер читает
// только как UTF-8; шесть знаков \uXXXX на букву вместо двух байт — ядро без секций на 0,3 КБ brotli тяжелее.
const CORE = "export const start = (options) => { globalThis.merfyStarted = [options, 'Корзина пуста']; };";
const MODULE = 'export default {mount(){globalThis.title="Избранное"}};';
const HEX = sha256(MODULE).slice('sha256:'.length);

describe('бандл страницы — UTF-8', () => {
  it('русский текст ядра и секции — как есть, без \\u-последовательностей', async () => {
    const source: BundleSource = {
      core: CORE,
      parts: [],
      sections: [{ name: 'shop:wishlist', kind: 'section', script: HEX, uses: [] }],
      modules: new Map([[HEX, MODULE]]),
    };
    const { text } = await bundleScript(source);
    expect(text).toContain('Корзина пуста');
    expect(text).toContain('Избранное');
    expect(text).not.toMatch(/\\u04[0-9a-f]{2}/i);
  });
});
