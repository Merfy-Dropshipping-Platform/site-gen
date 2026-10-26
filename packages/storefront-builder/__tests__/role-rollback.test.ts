import type { BrokenRollback, SectionRow } from '@merfy/storefront-sections';
import { describe, expect, it } from 'vitest';
import { rollbackText } from '../src/role-rollback';
import type { RoleErrorCount } from '../src/section-error-store';

// Текст уведомления мерчанту об ошибке в секции с ролью (блок 12 «Секций и SDK», часть 12в, Р12в-9, Р12в-11).
const COUNT: RoleErrorCount = {
  section: 'shop:cart-drawer',
  role: 'cart-drawer',
  title: 'Корзина-панель',
  scriptHash: `sha256:${'c'.repeat(64)}`,
  errors: 12,
  before: 4,
  stage: 'runtime',
  message: 'cart is not defined',
};

const row = (id: string): SectionRow => ({
  id,
  name: 'shop:cart-drawer',
  kind: 'section',
  author: 'shop',
  owner: '5c1e7a90-2b3d-4f6a-8c9e-0d1f2a3b4c5d',
  release: null,
  sourceHash: `s-${id}`,
  contentHash: `c-${id}`,
  manifest: {},
  template: '',
  style: '',
  render: null,
  renderHash: null,
  script: null,
  scriptHash: null,
  warnings: [],
  draft: false,
  published: false,
  createdAt: '2026-10-24T09:00:00.000Z',
});

const BROKEN = 'В секции «Корзина-панель» ошибка — cart is not defined.';
const CASES: [string, BrokenRollback, string][] = [
  [
    'rolled-back',
    { status: 'rolled-back', from: row('e1'), to: row('e0') },
    'Секция «Корзина-панель» вернулась к прежней версии: в новой ошибка — cart is not defined',
  ],
  ['no-previous', { status: 'no-previous', from: row('e1') }, `${BROKEN} Прежней версии нет: исправьте секцию`],
  [
    'role-changed',
    { status: 'role-changed', from: row('e1'), to: row('e0') },
    `${BROKEN} Прежнюю версию не вернули: у неё другая роль`,
  ],
  [
    'role-taken',
    { status: 'role-taken', from: row('e1'), to: row('e0'), holder: 'shop:my-cart-drawer' },
    `${BROKEN} Прежнюю версию не вернули: роль cart-drawer занята секцией shop:my-cart-drawer`,
  ],
  [
    'cooldown',
    { status: 'cooldown', from: row('e1'), notify: true },
    `${BROKEN} Прежнюю версию не вернули: секцию с этой ролью уже возвращали за последние сутки`,
  ],
  ['stale', { status: 'stale' }, ''],
];

describe('текст уведомления', () => {
  it.each(CASES)('%s', (_status, outcome, text) => {
    expect(rollbackText(COUNT, outcome)).toBe(text);
  });
});
