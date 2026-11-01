import { ERROR_CODES } from '@merfy/shell/events';
import { describe, expect, it } from 'vitest';
import { actionsPage } from '../src/pages/actions';

// actions.md: форма ответа действия (Result) и таблица кодов ошибок — по ERROR_CODES ядра, без пропусков.
const page = actionsPage();

describe('actions.md', () => {
  it('раздел «Ответ действия» описывает Result и не говорит, что секция получает исключение', () => {
    expect(page).toContain('## Ответ действия');
    expect(page).toContain('{ ok: true, data }');
    expect(page).toContain('{ ok: false, error: { code, message } }');
    expect(page).toContain('{ quiet: true }');
    expect(page).not.toContain('секция получает ошибку');
  });

  it('у каждого кода ошибки ядра есть строка таблицы', () => {
    for (const code of ERROR_CODES) expect(page, code).toContain(`| \`'${code}'\` |`);
  });

  it('refused объяснён: текст расширения в error.message, покупатель видит его', () => {
    const row = page.split('\n').find((line) => line.startsWith("| `'refused'` |")) ?? '';
    expect(row).toContain('refuse(');
    expect(row).toContain('error.message');
  });

  it('есть ссылка на вызов функции расширения в script.md', () => {
    expect(page).toContain('script.md#вызов-функции-расширения');
  });
});
