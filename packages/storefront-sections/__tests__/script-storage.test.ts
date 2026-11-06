import { describe, expect, it } from 'vitest';
import { checkScriptSource } from '../src/script-check';

// Ключ хранилища отказывается при сохранении, а не у покупателя (06.11: storage.get('firstAt') приняли, на витрине секция
// падала на каждой странице). Правило — функция ядра (@merfy/shell/storage-key): здесь проверяется форма вызова.
const HEAD = "import { defineSection } from '@merfy/shell';\n";
const inMount = (body: string, args = 'el, ctx'): string =>
  `${HEAD}export default defineSection({\n  mount(${args}) {\n    ${body}\n  },\n});\n`;
const keyProblems = (text: string) =>
  checkScriptSource({ 'script.ts': text }, 'script.ts').problems.filter((item) => item.code === 'storage-key-invalid');

describe('storage-key-invalid', () => {
  it.each([
    ["ctx.storage.get('firstAt');"],
    ["ctx.storage.set('firstAt', 1);"],
    ["ctx.storage.remove('firstAt');"],
    ["ctx?.storage?.get('firstAt');"],
    ['ctx.storage.get(`firstAt`);'],
    ["const key = 'firstAt'; ctx.storage.get(key);"],
    ["const { storage } = ctx; storage.get('firstAt');"],
    ["const box = ctx.storage; box.get('firstAt');"],
  ])('%s — отказ с местом и готовой заменой', (body) => {
    const [found, ...rest] = keyProblems(inMount(body));
    expect(rest).toEqual([]);
    expect(found).toMatchObject({ code: 'storage-key-invalid', file: 'script.ts' });
    expect(found?.message).toContain("напиши 'first-at'");
    expect(found?.line).toBe(4);
  });

  it('хранилище из параметра mount', () => {
    expect(keyProblems(inMount("storage.get('firstAt');", 'el, { storage }'))).toHaveLength(1);
  });

  it('верные ключи и ключ из вычисления не отказываются', () => {
    expect(keyProblems(inMount("ctx.storage.get('first-at'); ctx.storage.set('seen-2', 1);"))).toEqual([]);
    expect(keyProblems(inMount('const name = ctx.data.key; ctx.storage.get(name);'))).toEqual([]);
  });

  it('другие объекты с get не трогаются', () => {
    expect(keyProblems(inMount("ctx.data.get('firstAt'); ctx.page.$now.get('firstAt');"))).toEqual([]);
  });
});
