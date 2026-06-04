// Тесты removeDeletedExports — удаление export'ов из index.ts темы блока
// после удаления .classes.ts / .tokens.ts файлов.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import { removeDeletedExports } from '../lib/index-ts.mjs';

// Имитируем abs путь к index.ts: /tmp/theme-rose/blocks/Header/index.ts
const INDEX_PATH = '/tmp/theme-rose/blocks/Header/index.ts';
const BLOCK_DIR = path.dirname(INDEX_PATH);
const DELETED_TOKENS = path.join(BLOCK_DIR, 'Header.tokens.ts');
const DELETED_CLASSES = path.join(BLOCK_DIR, 'Header.classes.ts');
const FILE_PUCK_CONFIG = path.join(BLOCK_DIR, 'Header.puckConfig.ts');

const INDEX_SAMPLE_FULL = `export { HeaderPuckConfig, HeaderSchema } from './Header.puckConfig';
export type { HeaderProps } from './Header.puckConfig';
export { HeaderTokens } from './Header.tokens';
export { HeaderClasses } from './Header.classes';
`;

// ─────── Базовое удаление ───────

test('removeDeletedExports: удаляет одну декларацию (HeaderTokens) → остальные сохраняются', () => {
  const r = removeDeletedExports(INDEX_SAMPLE_FULL, [DELETED_TOKENS], INDEX_PATH);

  assert.equal(r.removedCount, 1);
  assert.deepEqual(r.removedDecls, ['./Header.tokens']);
  assert.equal(r.shouldDelete, false);

  // HeaderClasses должен остаться (его файл не удалён)
  assert.match(r.text, /HeaderClasses/);
  assert.match(r.text, /HeaderPuckConfig/);
  assert.match(r.text, /HeaderProps/);
  // HeaderTokens должен исчезнуть
  assert.doesNotMatch(r.text, /HeaderTokens/);
  assert.doesNotMatch(r.text, /Header\.tokens/);
});

test('removeDeletedExports: удаляет две декларации (Tokens + Classes) → puckConfig сохраняется', () => {
  const r = removeDeletedExports(
    INDEX_SAMPLE_FULL,
    [DELETED_TOKENS, DELETED_CLASSES],
    INDEX_PATH,
  );

  assert.equal(r.removedCount, 2);
  assert.deepEqual(
    new Set(r.removedDecls),
    new Set(['./Header.tokens', './Header.classes']),
  );
  assert.equal(r.shouldDelete, false);

  // Должны остаться оба puckConfig экспорта
  assert.match(r.text, /HeaderPuckConfig/);
  assert.match(r.text, /HeaderSchema/);
  assert.match(r.text, /HeaderProps/);
  // И не должно быть удалённых
  assert.doesNotMatch(r.text, /HeaderTokens/);
  assert.doesNotMatch(r.text, /HeaderClasses/);
  assert.doesNotMatch(r.text, /Header\.(tokens|classes)/);
});

test('removeDeletedExports: если все export\'ы удалены → shouldDelete=true', () => {
  // В этом index.ts только export'ы, которые ссылаются на удалённые файлы
  const onlyDeletedExports = `export { HeaderTokens } from './Header.tokens';
export { HeaderClasses } from './Header.classes';
`;
  const r = removeDeletedExports(
    onlyDeletedExports,
    [DELETED_TOKENS, DELETED_CLASSES],
    INDEX_PATH,
  );

  assert.equal(r.removedCount, 2);
  assert.equal(r.shouldDelete, true);
  // Текст должен быть пустым или содержать только пробелы
  assert.equal(r.text.trim(), '');
});

test('removeDeletedExports: идемпотентность — повторный запуск даёт тот же результат', () => {
  const r1 = removeDeletedExports(INDEX_SAMPLE_FULL, [DELETED_TOKENS, DELETED_CLASSES], INDEX_PATH);
  const r2 = removeDeletedExports(r1.text, [DELETED_TOKENS, DELETED_CLASSES], INDEX_PATH);

  // Второй запуск не должен ничего удалять (уже удалено)
  assert.equal(r2.removedCount, 0);
  assert.equal(r1.text, r2.text);
  // shouldDelete остаётся false (есть остальные exports)
  assert.equal(r2.shouldDelete, false);
});

test('removeDeletedExports: не падает если файла index.ts нет (через wrapper в скрипте)', () => {
  // Сам по себе модуль работает только с текстом. Защита от отсутствия файла
  // делается в caller'е (migrate-block-to-tokens.mjs). Здесь проверяем что
  // с пустым sourceText модуль ведёт себя предсказуемо.
  const r = removeDeletedExports('', [DELETED_TOKENS, DELETED_CLASSES], INDEX_PATH);

  assert.equal(r.removedCount, 0);
  assert.equal(r.shouldDelete, true);
  assert.deepEqual(r.removedDecls, []);
});

// ─────── Доп. сценарии — edge cases ───────

test('removeDeletedExports: не трогает декларации без module specifier', () => {
  const sample = `const X = 1;
export { X };
export { HeaderTokens } from './Header.tokens';
`;
  const r = removeDeletedExports(sample, [DELETED_TOKENS], INDEX_PATH);

  assert.equal(r.removedCount, 1);
  // `export { X };` должен остаться
  assert.match(r.text, /export\s*\{\s*X\s*\}/);
  // `HeaderTokens` должен исчезнуть
  assert.doesNotMatch(r.text, /HeaderTokens/);
});

test('removeDeletedExports: не трогает bare imports (npm package\'и)', () => {
  const sample = `export { foo } from 'some-pkg';
export { HeaderTokens } from './Header.tokens';
`;
  const r = removeDeletedExports(sample, [DELETED_TOKENS], INDEX_PATH);

  assert.equal(r.removedCount, 1);
  assert.match(r.text, /from\s*'some-pkg'/);
  assert.doesNotMatch(r.text, /Header\.tokens/);
});

test('removeDeletedExports: учитывает specifier с явным расширением (.ts/.js)', () => {
  const sample = `export { HeaderPuckConfig } from './Header.puckConfig';
export { HeaderTokens } from './Header.tokens.ts';
export { HeaderClasses } from './Header.classes.js';
`;
  const r = removeDeletedExports(
    sample,
    [DELETED_TOKENS, DELETED_CLASSES],
    INDEX_PATH,
  );

  assert.equal(r.removedCount, 2);
  assert.match(r.text, /HeaderPuckConfig/);
  assert.doesNotMatch(r.text, /HeaderTokens/);
  assert.doesNotMatch(r.text, /HeaderClasses/);
});

test('removeDeletedExports: возвращает removedDecls в порядке появления', () => {
  const r = removeDeletedExports(INDEX_SAMPLE_FULL, [DELETED_TOKENS, DELETED_CLASSES], INDEX_PATH);
  // В INDEX_SAMPLE_FULL первый удаляемый — Header.tokens, затем Header.classes
  assert.equal(r.removedDecls[0], './Header.tokens');
  assert.equal(r.removedDecls[1], './Header.classes');
});

test('removeDeletedExports: сохраняет export type декларации к не-удалённым файлам', () => {
  const sample = `export { HeaderPuckConfig } from './Header.puckConfig';
export type { HeaderProps } from './Header.puckConfig';
export { HeaderTokens } from './Header.tokens';
`;
  const r = removeDeletedExports(sample, [DELETED_TOKENS], INDEX_PATH);

  assert.equal(r.removedCount, 1);
  assert.match(r.text, /export type \{ HeaderProps \}/);
  assert.match(r.text, /HeaderPuckConfig/);
  assert.doesNotMatch(r.text, /HeaderTokens/);
});

test('removeDeletedExports: схлопывает множественные пустые строки', () => {
  const sample = `export { A } from './A';
export { HeaderTokens } from './Header.tokens';
export { B } from './B';
`;
  const r = removeDeletedExports(sample, [DELETED_TOKENS], INDEX_PATH);
  // Не должно быть трёх \n подряд
  assert.doesNotMatch(r.text, /\n{3,}/);
});
