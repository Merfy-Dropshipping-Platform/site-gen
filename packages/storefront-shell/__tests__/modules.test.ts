import { describe, expect, it } from 'vitest';
import { ShellError } from '../src/errors';
import { MODULES_TAG_ID, readModuleList } from '../src/modules';

// Страница с тегом списка модулей (или без него): readModuleList берёт только getElementById.
const page = (text: string | null) => ({
  getElementById: (id: string) => (id === MODULES_TAG_ID && text !== null ? { textContent: text } : null),
});

function errorOf(work: () => unknown): ShellError {
  try {
    work();
  } catch (error) {
    if (error instanceof ShellError) return error;
    throw error;
  }
  throw new Error('ошибки не было, а должна быть');
}

const LIST = {
  v: 1,
  modules: [
    { kind: 'section', name: 'nova:scarf-colors', src: '/_merfy/m/aa.js' },
    { kind: 'global', name: 'geo:locate', src: 'https://preview.example/_merfy/m/bb.js' },
  ],
};

describe('readModuleList', () => {
  it('тега нет — у страницы нет модулей', () => {
    expect(readModuleList(page(null))).toEqual([]);
  });

  it('строки section и global — как есть и по порядку', () => {
    expect(readModuleList(page(JSON.stringify(LIST)))).toEqual(LIST.modules);
  });

  it('в теге не JSON — modules-invalid', () => {
    const error = errorOf(() => readModuleList(page('{v:1')));
    expect(error.code).toBe('modules-invalid');
    expect(error.message).toBe('#merfy-modules: в теге не JSON');
  });

  it('другая версия формы или нет списка — modules-invalid', () => {
    expect(errorOf(() => readModuleList(page('{"v":2,"modules":[]}'))).code).toBe('modules-invalid');
    expect(errorOf(() => readModuleList(page('{"v":1}'))).code).toBe('modules-invalid');
  });

  it.each([
    ['вид не тот', { kind: 'island', name: 'nova:a', src: '/m.js' }],
    ['имя без приставки', { kind: 'section', name: 'scarf-colors', src: '/m.js' }],
    ['адрес не от корня', { kind: 'section', name: 'nova:a', src: 'm.js' }],
  ])('битая строка (%s) — ошибка с её номером', (_, entry) => {
    const error = errorOf(() => readModuleList(page(JSON.stringify({ v: 1, modules: [LIST.modules[0], entry] }))));
    expect(error.code).toBe('modules-invalid');
    expect(error.path).toBe('#merfy-modules.modules.1');
  });
});
